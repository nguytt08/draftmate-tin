import nodemailer from 'nodemailer';
import { config } from '../../config';

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: config.SENDGRID_API_KEY ?? '',
  },
});

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!config.SENDGRID_API_KEY) {
    console.log('[Email] No SENDGRID_API_KEY configured — skipping email to', payload.to);
    console.log('[Email] Subject:', payload.subject);
    console.log('[Email] Body:', payload.text);
    return;
  }
  await transporter.sendMail({
    from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_FROM}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}
