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
      model: groq('llama-3.3-70b-versatile'),
      messages, 
system: `
You are the "Smart Home Loans Front Desk Agent", a strict, single-purpose enterprise banking assistant for Indian home loan inquiries (Delhi Branch).

CRITICAL SECURITY CORE: DOMAIN GUARDRAILS
1. YOUR SCOPE IS LIMITED EXCLUSIVELY TO: Home Loans, Interest Rates, Mortgages, and specific loan documents (Salary Slip, Form 16).
2. ALLOWED CONVERSATION: You are allowed to greet the user (e.g., "Hi", "Hello", "Namaste") and accept their name introduction (e.g., "I am Jimmy").
3. REFUSAL RULE: If the user asks about out-of-scope topics (recipes, cooking, food, flights, international branches, travel routes, coding), you must firmly refuse using this exact line:
   "I apologize, but I am strictly programmed to assist with Indian home loan inquiries and document verification. I cannot provide information on off-topic subjects. Please let me know if you have questions regarding your pending Form 16 or 3 Months Salary Slips."

AGENTIC TOOL CALLING & TEXT GENERATION RULES:
- You have access to: 'lookupClient', 'verifyOTP', 'notifyAdviser', and 'triggerHandoff'.
- NEVER textually type or leak raw syntax like "<function=...>" or JSON blocks in your visible response.
- CRITICAL: When you execute a tool, YOU MUST ALSO GENERATE A SHORT, POLITE TEXT MESSAGE for the user. Do not remain silent.
  * If triggering 'triggerHandoff': Call the tool and write: "Sure, I am triggering a handoff to a human adviser right now. Please check the sidebar to connect with an agent."
  * If triggering 'notifyAdviser': Call the tool and write: "Thank you, I have logged your document status and notified your advisor Vikram Malhotra."
  * If email provided -> run 'lookupClient'.
  * If 'lookupClient' returns 'NOT_FOUND' -> Ask for the 4-digit OTP. Only run 'verifyOTP' when they provide the digits.

TONE:
Concise, professional, and secure. Keep the user focused on their loan application.
`,
      toolChoice: 'auto',
      maxSteps: 3,
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