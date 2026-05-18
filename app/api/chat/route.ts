import { groq } from '@ai-sdk/groq';
import { streamText, tool, CoreMessage} from 'ai'; 
import { connectDB } from '@/lib/db';
import { Client } from '@/models/Client';
import { otpStorage } from '@/lib/redis';
import { z } from 'zod';
import { sendOTPEmail, sendAdviserNotificationEmail } from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const { messages }: { messages: CoreMessage[] } = await req.json();

    await connectDB();

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content as string || '';

    const result = await streamText({
      model: groq('llama-3.1-8b-instant'),
      messages, 
system: `
You are the "Smart Home Loans Front Desk Agent", a strict, single-purpose enterprise banking assistant for Indian home loan inquiries (Delhi Branch).
FIRST RULE — GREETINGS:
If the user's message is ONLY a greeting (hi, hello, hii, namaste, hey, how are you),
respond with plain text ONLY. Do NOT call any tool. Just reply warmly and ask for their name.
CRITICAL SECURITY CORE: DOMAIN GUARDRAILS
1. YOUR SCOPE IS LIMITED EXCLUSIVELY TO: Home Loans, Interest Rates, Mortgages, and document verification for loan applications.
2. ALLOWED CONVERSATION: You may respond warmly to greetings and small talk 
   (e.g., "hello", "how are you", "good morning", "hii", "namaste"). Always reply 
   briefly and naturally, then gently steer back to the loan inquiry flow.
   Example: "I'm doing great, thank you! Now, could I get your name to get started?"
3. REFUSAL RULE: If the user asks about out-of-scope topics (recipes, cooking, flights, travel, coding, other AI systems), respond with:
   "I apologize, but I am strictly programmed to assist with Indian home loan inquiries and document verification. I cannot provide information on off-topic subjects."

IDENTITY & VERIFICATION FLOW:
- Step 1: Greet the user and ask for their name.
- Step 2: Ask for their email address to look them up.
- Step 3: Call 'lookupClient' with the email.
  * If 'lookupClient' returns a client record → greet them by name, confirm their branch, and use ONLY the data returned (application status, pending documents, assigned adviser name) in all subsequent responses.
  * If 'lookupClient' returns NOT_FOUND → inform them they appear to be a new user, tell them an OTP has been sent to their email, and ask them to provide it.
- NEVER call a tool and then wait silently. Every tool call must be followed by a visible response in the same turn.
- Step 4 (new users only): When the user provides a 4-digit OTP, call 'verifyOTP'. On success, ask how you can help them (online journey link or human adviser handoff).

CRITICAL DATA RULES — READ CAREFULLY:
- NEVER hardcode any client data. Every piece of personalised information (adviser name, pending documents, application stage, branch) MUST come from the tool response.
- If 'lookupClient' returns an adviser name, use that exact name. If no adviser is assigned, say "an adviser will be assigned to your case".
- If 'lookupClient' returns a list of pending documents, reference only those documents. Do not invent or assume any documents.
- If a field is missing from the tool response, do not guess — say you don't have that information on file yet.

AGENTIC TOOL CALLING RULES:
- Tools available: 'lookupClient', 'verifyOTP', 'notifyAdviser', 'triggerHandoff'.
- NEVER expose raw tool syntax, JSON, or function signatures in your visible response.
- Always generate a natural, polite message alongside every tool call.
- When calling 'triggerHandoff': also say "I'm arranging a handoff to a human adviser right now. Please check the sidebar to connect with an agent."
- When calling 'notifyAdviser': also say "I've logged your document update and notified [use adviser name from client record]."

NEW USER CONTEXT HANDLING:
- If the user is verified as NEW (lookupClient returned NOT_FOUND) and they ask about pending documents,
  application status, or any account-specific information, respond with:
  "Since you're a new client, you don't have an active application on file yet.
  To get started, you can apply online at https://smart-homeloans.in/apply or
  speak with an adviser who can guide you through the process."
- Do NOT say "I don't know" or go silent. Always provide a helpful next step.

POST-HANDOFF STATE:
- Once 'triggerHandoff' has been called in this session, maintain that context.
- If the user asks further questions after handoff is triggered, do not restart the verification flow.
- Respond with: "Your handoff is already in progress — your adviser will be able to help you with that directly. Please check the sidebar to connect."

CONVERSATION MEMORY:
- Remember the user's name, email, and all tool results throughout the session.
- Never ask for information the user has already provided.
- Keep context across turns — do not restart the flow mid-conversation.

TONE:
Concise, professional, and warm. Keep the user focused on their loan application.
`,
      toolChoice: 'auto',
      maxSteps: 5,
      tools: {
        lookupClient: tool({
          description: 'Look up a client account using their email address to check if they are an existing customer.',
          parameters: z.object({
            email: z.string().email(),
          }),
          execute: async ({ email }) => {
            try {
              const client = await Client.findOne({ email: email.toLowerCase() });

              if (!client) {
                const dynamicOTP = Math.floor(1000 + Math.random() * 9000).toString();
                try {
                  await otpStorage.saveOTP(email.toLowerCase(), dynamicOTP);
                    sendOTPEmail(email.toLowerCase(), dynamicOTP, 'Prospect')
                      .then(() => console.log(`[BG MAIL] OTP sent to ${email}`))
                      .catch(err => console.error('Background OTP Email Error:', err))
                } catch (redisErr) {
                  console.error('Redis Save/Email Failed:', redisErr);
                }

                return {
                  status: 'NOT_FOUND',
                  type: 'OTP_TRIGGERED_FOR_NEW_USER',
                  email: email.toLowerCase(),
                  message: 'No client profile found. OTP sent to verify this new user. Stop here and wait for OTP.',
                };
              }

              return {
                status: 'FOUND',
                type: 'KNOWN_CLIENT',
                email: client.email,
                name: client.name,
                applicationStatus: client.applicationStatus || 'Unknown',
                rejectionReason: client.rejectionReason,
                outstandingDocuments: client.outstandingDocuments || [],
                assignedAdviser: client.assignedAdviser || 'General Adviser',
                message: 'Client found successfully. Do NOT ask for OTP. Directly respond using this data.',
              };
            } catch (err) {
              console.error('Error in lookupClient tool:', err);
              return { status: 'ERROR', message: 'Database lookup failed.' };
            }
          },
        }),

        verifyOTP: tool({
          description: 'Verify the OTP code for an unrecognized/new user.',
          parameters: z.object({
            email: z.string().email(),
            userOTP: z.string(),
          }),
          execute: async ({ email, userOTP }) => {
            try {
              const cleanEmail = email.toLowerCase().trim();
              const cleanUserOTP = userOTP.trim();
              
              if (!cleanUserOTP || cleanUserOTP.length < 4) {
                return { status: 'INVALID', message: 'User has not typed a valid 4-digit OTP yet.' };
              }
              
              const rawSavedOTP = await otpStorage.getOTP(cleanEmail);
              const savedOTP = rawSavedOTP ? rawSavedOTP.toString().trim() : null;

              if (!savedOTP || savedOTP !== cleanUserOTP) {
                return { status: 'INVALID', message: 'Invalid OTP.' };
              }

              await otpStorage.deleteOTP(cleanEmail);

              return {
                status: 'VERIFIED',
                type: 'NEW_USER_VERIFIED',
                message: 'OTP Verified successfully. Share the online loan application link or offer a human adviser handoff.',
                onlineJourneyLink: 'https://smart-homeloans.com/apply-online',
              };
            } catch (err) {
              console.error('Error in verifyOTP tool:', err);
              return { status: 'ERROR', message: 'OTP verification internal error.' };
            }
          },
        }),
        
        notifyAdviser: tool({
          description: 'Notify the assigned adviser when a client mentions or uploads a document.',
          parameters: z.object({
            email: z.string().email().describe('The client\'s email address'),
            documentType: z.string().describe('The type of document mentioned, e.g., payslip, bank statement'),
          }),
          execute: async ({ email, documentType }) => {
            try {
              const client = await Client.findOne({ email: email.toLowerCase() });

              if (!client) {
                return { status: 'ERROR', message: 'Client not found.' };
              }

              const adviserName = client.assignedAdviser?.name || 'Loan Adviser';
              const adviserEmail = client.assignedAdviser?.email;
              const clientName = client.name;

              if (adviserEmail) {
                  sendAdviserNotificationEmail(adviserEmail, adviserName, clientName, email.toLowerCase(), documentType)
                    .then(() => console.log(`[BG MAIL] Adviser notified at ${adviserEmail}`))
                    .catch(err => console.error('Background Adviser Email Error:', err))
              }

              return {
                status: 'SUCCESS',
                message: `Adviser ${adviserName} has been successfully notified via a professional email (${adviserEmail}) about the submission of the ${documentType}.`,
              };

            } catch (err) {
              console.error('Failed to notify adviser in tool:', err);
              return { status: 'ERROR', message: 'Internal error while notifying the adviser.' };
            }
          },
        }),
        triggerHandoff: tool({
          description: 'Trigger this tool immediately when the user requests to speak with a human agent, adviser, or assistant.',
          parameters: z.object({
            email: z.string().email().optional().describe("The user's email address if available"),
          }),
          execute: async ({ email }) => {
            return {
              status: 'SUCCESS',
              type: 'HANDOFF_TRIGGERED',
              email: email || '',
              message: 'Handoff initiated. The UI sidebar form is now exposed to the user.',
            };
          },
        }),
      },
    });

    return result.toDataStreamResponse();

  } catch (error) {
    console.error("CRITICAL API ERROR:", error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}