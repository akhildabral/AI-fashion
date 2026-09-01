import nodemailer from 'nodemailer';
import { env } from '../config/env';

// Verification email delivery. With SMTP configured, real emails go out;
// without it, the link is logged to the server console so the flow stays
// testable before SMTP credentials exist.

const smtpConfigured = !!env.SMTP_HOST;

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  if (!transport) {
    console.log(`[mailer] SMTP not configured — verification link for ${to}: ${verifyUrl}`);
    return;
  }

  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: 'Verify your email — AI Fashion',
    text:
      `Welcome to AI Fashion!\n\n` +
      `Confirm your email by opening this link:\n${verifyUrl}\n\n` +
      `The link is valid for 24 hours. After verification your account joins ` +
      `the waitlist — we'll let you know when access is approved.\n\n` +
      `If you didn't sign up, you can ignore this email.`,
    html:
      `<p>Welcome to <strong>AI Fashion</strong>!</p>` +
      `<p><a href="${verifyUrl}">Confirm your email</a> (valid for 24 hours).</p>` +
      `<p>After verification your account joins the waitlist — we'll let you ` +
      `know when access is approved.</p>` +
      `<p style="color:#888">If you didn't sign up, you can ignore this email.</p>`,
  });
}
