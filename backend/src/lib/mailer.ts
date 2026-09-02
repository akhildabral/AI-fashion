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

// ---- Branded HTML wrapper ------------------------------------------------
// Email clients need table layout + inline styles (no external CSS, no web
// fonts). Palette mirrors the app's Atelier "gallery by day": warm paper
// ground, ink text, brass accent, sharp 3px chrome.

const C = {
  bone: '#EBE5D7',
  surface: '#F5F0E6',
  ink: '#221B12',
  inkSoft: '#6B6252',
  brass: '#B98C3B',
  brassInk: '#1A1509',
  brassText: '#8A6620',
  border: '#DDD5C3',
};

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "'Bodoni MT','Didot',Georgia,'Times New Roman',serif";

interface EmailBody {
  /** Big display line, e.g. "You're in." */
  headline: string;
  /** Italic serif line under the headline. */
  tagline: string;
  /** Paragraphs between tagline and button. */
  paragraphs: string[];
  /** Button label + destination. */
  cta: { label: string; url: string };
  /** Small print under the button (validity, ignore-note). */
  footnote: string;
}

export function renderEmail(b: EmailBody): string {
  const paragraphs = b.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink};">${p}</p>`,
    )
    .join('');

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:${C.bone};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.bone};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <tr><td align="center" style="padding:0 0 28px;">
          <span style="font-family:${SERIF};font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${C.ink};">AI&nbsp;Fashion</span><span style="font-family:${SERIF};font-size:20px;font-weight:700;color:${C.brass};">*</span>
        </td></tr>

        <tr><td style="background-color:${C.surface};border:1px solid ${C.border};border-top:2px solid ${C.brass};border-radius:3px;padding:36px 36px 32px;">
          <h1 style="margin:0 0 6px;font-family:${SERIF};font-size:34px;font-weight:500;letter-spacing:-0.4px;line-height:1.08;color:${C.ink};">${b.headline}</h1>
          <p style="margin:0 0 22px;font-family:${SERIF};font-style:italic;font-size:16px;color:${C.brassText};">${b.tagline}</p>
          ${paragraphs}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
            <tr><td style="background-color:${C.brass};border-radius:3px;">
              <a href="${b.cta.url}" style="display:inline-block;padding:13px 30px;font-family:${SANS};font-size:15px;font-weight:700;color:${C.brassInk};text-decoration:none;">${b.cta.label}</a>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.inkSoft};">${b.footnote}</p>
          <p style="margin:16px 0 0;font-family:${SANS};font-size:11px;line-height:1.5;color:${C.inkSoft};word-break:break-all;">Button not working? Paste this link into your browser:<br><a href="${b.cta.url}" style="color:${C.brassText};">${b.cta.url}</a></p>
        </td></tr>

        <tr><td align="center" style="padding:22px 0 0;">
          <p style="margin:0;font-family:${SERIF};font-style:italic;font-size:13px;color:${C.inkSoft};">Every morning, an outfit — already waiting.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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
    html: renderEmail({
      headline: 'Almost there.',
      tagline: 'one click between you and your stylist',
      paragraphs: [
        `Confirm this email address to finish setting up your <strong>AI&nbsp;Fashion</strong> account.`,
      ],
      cta: { label: 'Confirm my email', url: verifyUrl },
      footnote:
        `The link is valid for 24 hours. After verification your account joins the ` +
        `waitlist — we'll let you know when access is approved. If you didn't sign ` +
        `up, you can ignore this email.`,
    }),
  });
}

export async function sendInviteEmail(to: string, inviteUrl: string): Promise<boolean> {
  if (!transport) {
    console.log(`[mailer] SMTP not configured — invite link for ${to}: ${inviteUrl}`);
    return false;
  }
  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "You're in — your AI Fashion invite",
    text:
      `You're off the waitlist!\n\n` +
      `Your personal stylist is ready. Set your password and step in:\n${inviteUrl}\n\n` +
      `This invite link is valid for 7 days.`,
    html: renderEmail({
      headline: "You're in.",
      tagline: 'your personal stylist has been expecting you',
      paragraphs: [
        `You're off the waitlist. Your closet, your daily outfit brief, and the ` +
          `Mirror are ready — set your password and step inside.`,
      ],
      cta: { label: 'Claim my account', url: inviteUrl },
      footnote: `This invite is personal to you and valid for 7 days.`,
    }),
  });
  return true;
}
