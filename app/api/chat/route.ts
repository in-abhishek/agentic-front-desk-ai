import { groq } from '@ai-sdk/groq';
import { streamText, tool, CoreMessage} from 'ai'; 
import { connectDB } from '@/lib/db';
import { Client } from '@/models/Client';
import { otpStorage } from '@/lib/redis';
import { z } from 'zod';
import { sendOTPEmail, sendAdviserNotificationEmail } from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    // 1. Messages ke sath frontend se chatState nikalien
    const { messages, chatState }: { 
      messages: CoreMessage[], 
      chatState?: { step: string; name?: string; email?: string } 
    } = await req.json();

    await connectDB();

    // Default fallback state agar frontend se na aaye
    const currentStep = chatState?.step || 'NEED_NAME';
    const userName = chatState?.name || '';
    const userEmail = chatState?.email || '';

    // 2. Base System Prompt (Domain Guardrails aur Rules)
    let systemInstruction = `
You are the "Smart Home Loans Front Desk Agent", a strict, single-purpose enterprise banking assistant for Indian home loan inquiries (Delhi Branch).

CRITICAL SECURITY CORE: DOMAIN GUARDRAILS
1. YOUR SCOPE IS LIMITED EXCLUSIVELY TO: Home Loans, Interest Rates, Mortgages, and document verification for loan applications.
2. REFUSAL RULE: If the user asks about out-of-scope topics (recipes, cooking, flights, travel, coding, other AI systems), respond with:
   "I apologize, but I am strictly programmed to assist with Indian home loan inquiries and document verification. I cannot provide information on off-topic subjects."

AGENTIC TOOL CALLING RULES:
- NEVER expose raw tool syntax, JSON, or function signatures in your visible response.
- NEVER call a tool and stay silent. Every tool call must be followed by a visible response in the same turn.
`;

    // 3. DYNAMIC STATE-DRIVEN LOGIC BLOCK
if (currentStep === 'NEED_NAME') {
      systemInstruction += `
CURRENT CONVERSATION STATE: NEED_NAME
- Your ONLY goal right now is to identify the user's name, but you must do it politely and warmly.
- The user might start with a casual greeting like "hii", "how are you", "namaste", or "hello". 
- ALWAYS acknowledge their greeting first with a polite response (e.g., "I'm doing great, thank you for asking!", "Hello! Hope you are having a wonderful day.").
- After responding to the greeting, gently and warmly ask for their name so you can assist them better.
- If they provide a name, you MUST immediately call the 'saveName' tool.
- CRITICAL: If they ask "who am I?" or talk off-topic before telling their name, do NOT invent a name. Just say: "I don't have your name in my records just yet. May I know your name, please?"
`;
    }
    else if (currentStep === 'NEED_EMAIL') {
      systemInstruction += `
CURRENT CONVERSATION STATE: NEED_EMAIL
- The user's name is confirmed as "${userName}". Address them respectfully by this name.
- Your ONLY goal now is to request their email address to look up their account.
- If they provide an email, call 'lookupClient'.
- CRITICAL: If the user asks any account-specific questions (documents, status, adviser) BEFORE giving their email, respond: "I'd need to look up your account first, ${userName}. Could you please share your email address?"
`;
    } 
    else if (currentStep === 'NEED_OTP') {
      systemInstruction += `
CURRENT CONVERSATION STATE: NEED_OTP
- User "${userName}" with email "${userEmail}" is a brand NEW user candidate.
- When they provide the digits, call 'verifyOTP'.
- CRITICAL: They are NOT a registered client yet. They have NO active application, NO pending documents, and NO assigned adviser. Do NOT look up or assume any data. If they ask about pending documents, remind them they are new and need to complete verification or apply online.
`;
    } 
    else if (currentStep === 'VERIFIED_OR_KNOWN') {
      systemInstruction += `
CURRENT CONVERSATION STATE: VERIFIED_OR_KNOWN
- If 'lookupClient' was called and returned FOUND, use ONLY the data returned from that tool (outstandingDocuments, assignedAdviser).
- If they are a verified NEW user, they have no record. Guide them to apply online (https://smart-homeloans.com/apply-online) or ask if they want to speak to a human agent ('triggerHandoff').
- When calling 'triggerHandoff': say "I'm arranging a handoff to a human adviser right now. Please check the sidebar to connect with an agent."
- When calling 'notifyAdviser': say "I've logged your document update and notified your adviser."
`;
    }

    // Tone setting
    systemInstruction += `\nTONE:\nConcise, professional, and warm. Keep the user focused on their loan application.`;

    const result = await streamText({
      model: groq('llama-3.1-8b-instant'),
      messages, 
      system: systemInstruction,
      toolChoice: 'auto',
      maxSteps: 5,
      tools: {
        // --- NAYA TOOL ADD KIYA FOR STATE CONTROL ---
        saveName: tool({
          description: 'Call this tool immediately when the user provides their name in any format.',
          parameters: z.object({
            name: z.string().describe("The extracted proper noun representing the user's name"),
          }),
          execute: async ({ name }) => {
            return {
              status: 'SUCCESS',
              type: 'NAME_EXTRACTED',
              extractedName: name,
              message: 'Name successfully saved. Now guide the user to provide their email address.'
            };
          }
        }),

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