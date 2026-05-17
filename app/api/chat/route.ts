import { groq } from '@ai-sdk/groq';
import { streamText, tool, CoreMessage } from 'ai'; 
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
You are the Smart Home Loans Front Desk Agent. An intelligent, agentic conversational assistant.

CRITICAL INSTRUCTIONS:
1. When a user provides an email, ALWAYS run 'lookupClient' first.
2. IF 'lookupClient' returns status 'FOUND': The user is a KNOWN client. DO NOT ask for OTP. Directly greet them by their name, acknowledge their request, and provide their application status or outstanding documents using the returned data.
3. IF 'lookupClient' returns status 'NOT_FOUND': The user is UNRECOGNIZED. An OTP has been sent to them. STOP HERE and ask the user to enter their 4-digit OTP code to verify their identity.
4. Only trigger 'verifyOTP' when an unrecognized user provides a numerical 4-digit code.
5. If a verified or known user mentions uploading or sending a document (like a payslip, bank statement, ID), ALWAYS execute the 'notifyAdviser' tool immediately to log it and notify their adviser.
6. Keep responses highly personalized, natural, and continuous.
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
                  await sendOTPEmail(email.toLowerCase(), dynamicOTP, 'Prospect');
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
                await sendAdviserNotificationEmail(
                  adviserEmail,
                  adviserName,
                  clientName,
                  email.toLowerCase(),
                  documentType
                );
                console.log(`[MAIL SENT] Professional notification email delivered to Adviser at ${adviserEmail}`);
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
      },
    });

    return result.toDataStreamResponse();

  } catch (error) {
    console.error("CRITICAL API ERROR:", error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}