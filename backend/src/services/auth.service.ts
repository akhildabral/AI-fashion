import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { sendVerificationEmail } from '../lib/mailer';
import { issueTokens, type ClientInfo } from '../lib/session';
import { HttpError } from '../middleware/error';

// Waitlist-gated auth: register → verify email → wait for admin approval →
// log in. Tokens carry only the user id; every authed request re-checks the
// account in the DB (see middleware/auth), so suspension takes effect
// immediately — no long-lived token outlives revoked access. The app also
// gets a refresh token (lib/session) so it stays signed in between launches.

export interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
}

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// A fixed bcrypt hash to compare against when no account exists, so the login
// path takes the same time whether or not the email is real.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 12);

function toPublic(user: {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
}): PublicUser {
  const { id, email, role, status, emailVerified, firstName, lastName } = user;
  return { id, email, role, status, emailVerified, firstName, lastName };
}

const isAdminEmail = (email: string) => env.ADMIN_EMAILS.includes(email);

export interface RegisterResult {
  user: PublicUser;
  // Set only for bootstrap admins, who skip the waitlist entirely.
  token?: string;
  message: string;
}

export async function registerUser(
  email: string,
  password: string,
  verifyUrlBase: string,
): Promise<RegisterResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = isAdminEmail(normalizedEmail);
  const verifyToken = randomBytes(32).toString('hex');

  const created = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      role: admin ? 'admin' : 'user',
      status: admin ? 'approved' : 'pending',
      // Email must be proven even for a bootstrap admin, so whoever registers
      // a listed admin address can't become a working admin without inbox
      // access. Access opens on verify.
      emailVerified: false,
      verifyToken,
      verifyTokenExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });

  if (admin) {
    await sendVerificationEmail(
      normalizedEmail,
      `${verifyUrlBase}/verify-email?token=${verifyToken}`,
    );
    return {
      user: toPublic(created),
      message: 'Admin account created — verify your email to sign in.',
    };
  }

  await sendVerificationEmail(
    normalizedEmail,
    `${verifyUrlBase}/verify-email?token=${verifyToken}`,
  );

  return {
    user: toPublic(created),
    message:
      'Check your inbox to verify your email. Access is limited right now — ' +
      'after verification your account joins the waitlist for approval.',
  };
}

export async function verifyEmail(token: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { verifyToken: token } });
  if (!user || !user.verifyTokenExpires || user.verifyTokenExpires < new Date()) {
    throw new HttpError(400, 'This verification link is invalid or has expired');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifyToken: null, verifyTokenExpires: null },
  });
  return toPublic(updated);
}

export async function resendVerification(email: string, verifyUrlBase: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Same response whether or not the account exists — no enumeration.
  if (!user || user.emailVerified) return;

  const verifyToken = randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyToken, verifyTokenExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS) },
  });
  await sendVerificationEmail(
    normalizedEmail,
    `${verifyUrlBase}/verify-email?token=${verifyToken}`,
  );
}

export async function loginUser(
  email: string,
  password: string,
  client: ClientInfo = {},
): Promise<{ user: PublicUser; token: string; refreshToken?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    // Spend the same time as a real bcrypt compare so a missing account can't
    // be told apart from a wrong password by timing.
    await bcrypt.compare(password, DUMMY_HASH);
    throw new HttpError(401, 'Invalid email or password');
  }

  if (!user.passwordHash) {
    // Waitlist entries and Google-only accounts have no password.
    if (user.status === 'waitlist' || user.status === 'pending') {
      throw new HttpError(403, "You're on the waitlist — we'll email your invite soon");
    }
    if (user.status === 'invited') {
      throw new HttpError(403, 'Use the invite link we emailed you to set a password');
    }
    throw new HttpError(401, 'This account signs in with Google');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  // Bootstrap/repair: configured admin emails are always elevated.
  let current = user;
  if (isAdminEmail(normalizedEmail) && (user.role !== 'admin' || user.status !== 'approved')) {
    current = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin', status: 'approved', emailVerified: true },
    });
  }

  if (!current.emailVerified) {
    throw new HttpError(403, 'Please verify your email first — check your inbox');
  }
  if (current.status === 'waitlist' || current.status === 'pending') {
    throw new HttpError(
      403,
      "You're on the waitlist — we'll email you once your access is approved",
    );
  }
  if (current.status === 'invited') {
    throw new HttpError(403, 'Your invite is waiting — use the link we emailed to finish setup');
  }
  if (current.status !== 'approved') {
    throw new HttpError(403, 'This account does not currently have access');
  }

  return { user: toPublic(current), ...(await issueTokens(current, client)) };
}
