import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai'; 
import { connectDB } from '@/lib/db';
import { Client } from '@/models/Client';
import { otpStorage } from '@/lib/redis';
import { z } from 'zod';
import { sendOTPEmail } from '@/lib/mailer'; 
import { sendAdviserNotificationEmail } from '@/lib/mailer'; 

const SlotFillingSchema = z.object({
  updated_slots: z.object({
    user_type: z.enum(['KNOWN', 'UNKNOWN']).nullable(),
    client_name: z.string().nullable(),
    is_otp_verified: z.boolean(),
    pending_action: z.enum(['SHOW_STATUS', 'SHARE_LOAN_LINK', 'HUMAN_HANDOFF', 'VERIFY_OTP']).nullable(),
  }),
  extracted_lead_details: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  reply: z.string().describe("Your contextual response. Keep it short, natural, and friendly."),
});

export async function POST(req: Request) {
  try {
    const { messages, sessionSlots } = await req.json();
    const lastUserMsg = messages[messages.length - 1]?.content?.toString().trim() || "";

    await connectDB();

    // 1. Maintain state from session history
    const currentSlots = {
      user_type: sessionSlots?.user_type || null,
      client_name: sessionSlots?.client_name || null,
      is_otp_verified: sessionSlots?.is_otp_verified || false,
      pending_action: sessionSlots?.pending_action || null,
      email: sessionSlots?.email || null,
    };

    // Immediate dynamic email extraction string matching
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const extractedEmail = lastUserMsg.match(emailRegex);
    if (extractedEmail) {
      currentSlots.email = extractedEmail[0].toLowerCase();
    }

    let backendActionLogs: string[] = [];
    let adviserEmailToNotify: string | null = null; 

    // ==========================================================
    // FIX 1: ULTIMATE TYPE-SAFE & SPACE-SAFE OTP INTERCEPTOR
    // ==========================================================
    const is6DigitOtp = /^\d{6}$/.test(lastUserMsg);
    
    if (is6DigitOtp && currentSlots.email && currentSlots.pending_action === "VERIFY_OTP") {
      const cachedOtp = await otpStorage.getOTP(currentSlots.email);
      
      const cleanCached = cachedOtp ? cachedOtp.toString().trim() : "";
      const cleanInput = lastUserMsg.toString().trim();

      if (cleanCached && cleanCached === cleanInput) {
        currentSlots.is_otp_verified = true;
        currentSlots.pending_action = null; 
        
        await otpStorage.deleteOTP(currentSlots.email); 
        backendActionLogs.push(`[OTP Engine] Token match successful for ${currentSlots.email}`);

        const updatedSlots = {
          ...currentSlots,
          phone: sessionSlots?.phone || null,
        };

        return new Response(JSON.stringify({
          slots: updatedSlots,
          backend_logs: backendActionLogs,
          reply: `Thank you! Your email verification is successful. Since we didn't find any existing loan application under this email, would you like me to share the link to start a new application, or would you like to speak to an adviser?`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        backendActionLogs.push(`[OTP Engine] Invalid code attempt. Cached: ${cleanCached}, Input: ${cleanInput}`);
        const updatedSlots = {
          ...currentSlots,
          is_otp_verified: false, 
          phone: sessionSlots?.phone || null,
        };

        return new Response(JSON.stringify({
          slots: updatedSlots,
          backend_logs: backendActionLogs,
          reply: `Sorry, the verification code you entered is incorrect or has expired. Please check your email and try again, or ask me to resend it.`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ==========================================================
    // SMART DATABASE SYNC & AUTO-VERIFICATION FOR KNOWN USERS
    // ==========================================================
    let dbContextInfo = "No account lookup performed yet because email is missing.";
    let clientRecord = null;

    if (currentSlots.email) {
      clientRecord = await Client.findOne({ email: currentSlots.email.toLowerCase() });
      if (clientRecord) {
        currentSlots.user_type = "KNOWN";
        currentSlots.client_name = clientRecord.name;
        
        // AGAR USER DATABASE MEIN HAI TO OTP AUTO-VERIFY MANA JAYEGA (NO OTP REQUIRED)
        currentSlots.is_otp_verified = true; 
        
        adviserEmailToNotify = clientRecord.assignedAdviserEmail || "default-adviser@homeloans.com"; 
        
        const pendingDocs = clientRecord.outstandingDocuments && clientRecord.outstandingDocuments.length > 0
          ? clientRecord.outstandingDocuments.join(", ")
          : "None";

        dbContextInfo = `Account FOUND for ${clientRecord.name}. User is KNOWN. 
        Loan Application Status: ${clientRecord.applicationStatus}.
        Pending/Outstanding Documents: ${pendingDocs}.`;
      } else {
        // AGAR USER DB MEIN NAHI HAI TO OTP KI REQUIREMENT RAHEGI
        currentSlots.user_type = "UNKNOWN";
        dbContextInfo = `Account NOT found for email ${currentSlots.email}. User is UNKNOWN. Verification required if performing protected actions.`;
      }
    }

    // Capture dynamic user context triggers
    const wantsStatus = lastUserMsg.toLowerCase().includes('status') || currentSlots.pending_action === 'SHOW_STATUS';
    const isResendRequest = lastUserMsg.toLowerCase().includes('nhi aayi') || lastUserMsg.toLowerCase().includes('nahi aayi') || lastUserMsg.toLowerCase().includes('resend');

    // ==========================================================
    // FIX 2: UPLOADED / SUBMITTED DOCUMENT INTERCEPT DETECTION
    // ==========================================================
    const userClaimedSubmission = lastUserMsg.toLowerCase().includes('submit') || 
                                  lastUserMsg.toLowerCase().includes('upload') || 
                                  lastUserMsg.toLowerCase().includes('bhej diya') || 
                                  lastUserMsg.toLowerCase().includes('de diya');

    if (userClaimedSubmission) {
      if (currentSlots.user_type === "KNOWN") {
        // SNEHA CASE: Seedhe adviser handoff state trigger hoga bina OTP ke
        currentSlots.pending_action = "HUMAN_HANDOFF";
      } else if (currentSlots.user_type === "UNKNOWN") {
        // SURESH CASE: DB mein nahi hai toh pehle verification block par bhejenge
        currentSlots.pending_action = "VERIFY_OTP";
      }
    }

    let activeGuidance = "";
    if (currentSlots.pending_action === "HUMAN_HANDOFF" || lastUserMsg.toLowerCase().includes('adviser')) {
      activeGuidance = `
      CRITICAL SITUATION: The user wants to speak to an adviser OR has claimed that they have already submitted/uploaded their outstanding documents.
      - Change 'pending_action' to "HUMAN_HANDOFF" right now.
      - In your 'reply', explicitly acknowledge their submission claim and tell them that a loan adviser is being assigned to verify it right away.
      - If Email is missing, your 'reply' MUST ask for it first.
      `;
    }

    // 3. System Instruction - Strict Slot Mapping & DB Document Rules
    const systemInstruction = `
You are the "Smart Home Loans Front Desk Agent" for Indian home loan inquiries (Delhi Branch).
You operate purely using fluid slot-filling properties.

CURRENT CONVERSATION SLOTS STATE:
- user_type: ${currentSlots.user_type}
- client_name: ${currentSlots.client_name}
- is_otp_verified: ${currentSlots.is_otp_verified}
- pending_action: ${currentSlots.pending_action}
- current_email: ${currentSlots.email}

DATABASE CONTEXT:
${dbContextInfo}

${activeGuidance}

CRITICAL RULES ORDER:
1. IF 'current_email' IS MISSING/NULL: You absolutely CANNOT check loan status or clear any action. Your only task is to greet the user and ask for their registered email address. Your 'reply' MUST be: "Sure, I can help you with your loan status. Could you please share your registered email ID?"
2. IF USER IS "KNOWN" AND CLAIMS THEY SUBMITTED/UPLOADED PENDING DOCUMENTS: Route them to human support immediately. Set 'pending_action' to "HUMAN_HANDOFF". Your 'reply' MUST reassure them by saying that you are notifying an adviser to verify their newly submitted files.
3. IF EMAIL IS ALREADY PROVIDED IN THE MESSAGE AND USER IS "UNKNOWN": You must transition to verification state. Set 'pending_action' to "VERIFY_OTP". Your 'reply' MUST inform them that you have sent a verification code to their email address to verify their identity. Do NOT ask them to share their email again.
4. ANSWER DIRECTLY FROM DATABASE: If the user is a KNOWN customer and asks about pending or required documents, check "Pending/Outstanding Documents" inside DATABASE CONTEXT. List them explicitly by name so the user knows exactly what is missing.
5. IF EMAIL IS AVAILABLE AND USER IS "KNOWN" (AND NOT CLAIMING DOCUMENT SUBMISSION): Automatically set 'pending_action' to "SHOW_STATUS". Greet them by name and present the status from DATABASE CONTEXT.
6. If the user says they didn't get the verification code ("mail nhi aayi"), apologize and keep 'pending_action' as "VERIFY_OTP".

INSTRUCTION FOR OUTPUT:
Fill the JSON structure perfectly. Keep responses natural, short, and targeted.
`;

    // 4. Run LLM
    const { object: llmOutput } = await generateObject({
      model: groq('llama-3.1-8b-instant'),
      messages,
      system: systemInstruction,
      schema: SlotFillingSchema,
    });

    // 5. Merge Outputs cleanly
    let finalReply = llmOutput.reply;
    const updatedSlots = {
      user_type: llmOutput.updated_slots.user_type || currentSlots.user_type,
      client_name: currentSlots.client_name || llmOutput.updated_slots.client_name || llmOutput.extracted_lead_details.name,
      is_otp_verified: llmOutput.updated_slots.is_otp_verified !== undefined ? llmOutput.updated_slots.is_otp_verified : currentSlots.is_otp_verified,
      pending_action: llmOutput.updated_slots.pending_action || currentSlots.pending_action,
      email: currentSlots.email || llmOutput.extracted_lead_details.email,
      phone: sessionSlots?.phone || null,
    };

    // HARD SECURITY GUARD RAIL: Ensure state persistency
    if (!updatedSlots.email) {
      updatedSlots.pending_action = null;
      updatedSlots.user_type = null;
      updatedSlots.is_otp_verified = false;
      
      if (wantsStatus) {
        finalReply = `Sure, I can help you with your loan status. Could you please share your registered email ID first?`;
      }
    }

    // 6. Side Effects Engine - Fires OTP ONLY if LLM explicitly resolves pending_action to VERIFY_OTP
    if (updatedSlots.pending_action === "VERIFY_OTP" && updatedSlots.email && (!updatedSlots.is_otp_verified || isResendRequest)) {
      try {
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        await otpStorage.saveOTP(updatedSlots.email, generatedOtp);
        
        const recipientName = updatedSlots.client_name || "Valued Customer";
        await sendOTPEmail(updatedSlots.email, generatedOtp, recipientName);
        
        backendActionLogs.push(`[OTP Engine] Security token successfully sent to: ${updatedSlots.email}`);
      } catch (otpErr) {
        console.error("Failed executing mail engine pipeline:", otpErr);
        backendActionLogs.push(`[OTP Engine Exception] Errored sending dispatch to: ${updatedSlots.email}`);
      }
    }

    // ==========================================
    // BACKEND ADVISER NOTIFICATION ACTION TRIGGER
    // ==========================================
    if (updatedSlots.pending_action === "HUMAN_HANDOFF" && updatedSlots.email && updatedSlots.is_otp_verified) {
      const activeName = updatedSlots.client_name || "Customer";
      
      if (userClaimedSubmission && adviserEmailToNotify) {
        try {
          let detectedDoc = "Outstanding Document";
          if (lastUserMsg.toLowerCase().includes("form 16") || lastUserMsg.toLowerCase().includes("form16")) {
            detectedDoc = "Form 16";
          } else if (lastUserMsg.toLowerCase().includes("salary") || lastUserMsg.toLowerCase().includes("slip")) {
            detectedDoc = "3 Months Salary Slip";
          }

          await sendAdviserNotificationEmail(
            adviserEmailToNotify,                  
            "Adviser Team",                        
            activeName,                              
            updatedSlots.email,                      
            detectedDoc                             
          );
          
          backendActionLogs.push(`[Mailer Engine] Successfully dispatched notification email to Assigned Adviser: ${adviserEmailToNotify}`);
        } catch (mailErr) {
          console.error("Failed notifying assigned adviser via mail:", mailErr);
          backendActionLogs.push(`[Mailer Exception] Error sending mail alert to adviser: ${adviserEmailToNotify}`);
        }
      } else {
        backendActionLogs.push(`Handoff executed for ${activeName} (${updatedSlots.email}) without document action.`);
      }
    }

    return new Response(JSON.stringify({
      slots: updatedSlots,
      backend_logs: backendActionLogs,
      reply: finalReply,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("CRITICAL API ERROR:", error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}