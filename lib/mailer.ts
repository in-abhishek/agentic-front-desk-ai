import nodemailer from 'nodemailer';

// Mailtrap SMTP configuration
export const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: process.env.MAILTRAP_USER, 
    pass: process.env.MAILTRAP_PASS, 
  },
});

export async function sendOTPEmail(toEmail: string, otp: string, userName: string) {
  const mailOptions = {
    from: '"Smart Home Loans" <noreply@smarthomeloans.com>',
    to: toEmail,
    subject: "Your Smart Home Loans Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #1a73e8; text-align: center;">Smart Home Loans</h2>
        <hr style="border: 0; border-top: 1px solid #e0e0e0;" />
        <p>Hello <strong>${userName}</strong>,</p>
        <p>To safely access your home loan application details, please use the following 4-digit One-Time Password (OTP):</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #fff; background-color: #1a73e8; padding: 10px 25px; border-radius: 5px; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="color: #666; font-size: 14px;">This OTP is confidential and valid for 5 minutes. Please do not share it with anyone.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin-top: 30px;" />
        <p style="font-size: 12px; color: #999; text-align: center;">This is an automated system email, please do not reply directly.</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

export async function sendAdviserNotificationEmail(
  adviserEmail: string, 
  adviserName: string, 
  clientName: string, 
  clientEmail: string, 
  documentType: string
) {
  const mailOptions = {
    from: `"Smart Home Loans Desk" <${process.env.EMAIL_USER}>`,
    to: adviserEmail,
    subject: ` [Action Required] New Document Submitted by ${clientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #1a73e8; margin-bottom: 20px;">New Document Alert</h2>
        <p>Dear <strong>${adviserName}</strong>,</p>
        <p>This is to notify you that your client has submitted a new document through the AI Front Desk Assistant.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Client Name:</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${clientName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Client Email:</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${clientEmail}</td>
          </tr>
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Document Received:</td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #202124; font-weight: bold; text-transform: capitalize;">${documentType}</td>
          </tr>
        </table>
        
        <p>Please log in to your portal to review this document.</p>
        <br/>
        <p style="font-size: 12px; color: #777;">This is an automated notification from Smart Home Loans Front Desk Agent.</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}