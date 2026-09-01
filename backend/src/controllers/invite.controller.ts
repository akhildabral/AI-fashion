import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';

// Invite-only onboarding: nobody self-creates an account. Joining the
// waitlist logs an email; an admin approval mints an invite link; the link
// sets a password and activates. Google SSO lands on the same waitlist.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  } as SignOptions);
}

export function publicOrigin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
  return `${proto}://${req.get('host')}`;
}

/** Frontend bootstrap config (public). */
export function authConfig(_req: Request, res: Response) {
  res.json({ googleClientId: env.GOOGLE_CLIENT_ID ?? null });
}

const waitlistSchema = z.object({ email: z.string().email() });

/** Public: log an email on the waitlist. Deliberately non-enumerating. */
export async function joinWaitlist(req: Request, res: Response) {
  const { email } = waitlistSchema.parse(req.body);
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (!existing) {
    await prisma.user.create({
      data: { email: normalized, status: 'waitlist', emailVerified: false },
    });
  }
  res.json({
    message: "You're on the list — we'll email your invite as spots open up.",
  });
}

/** Mint (or refresh) an invite for a user row; returns the invite URL. */
export async function mintInvite(userId: string, origin: string): Promise<string> {
  const inviteToken = randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: {
      inviteToken,
      inviteTokenExpires: new Date(Date.now() + INVITE_TTL_MS),
      status: 'invited',
    },
  });
  return `${origin}/invite?token=${inviteToken}`;
}

const tokenSchema = z.object({ token: z.string().min(16).max(128) });

async function findByInviteToken(token: string) {
  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user || !user.inviteTokenExpires || user.inviteTokenExpires < new Date()) {
    throw new HttpError(400, 'This invite link is invalid or has expired');
  }
  return user;
}

/** Public: preview an invite (who it's for) before accepting. */
export async function inviteInfo(req: Request, res: Response) {
  const { token } = tokenSchema.parse({ token: req.query.token });
  const user = await findByInviteToken(String(token));
  res.json({ email: user.email, firstName: user.firstName });
}

const acceptSchema = z.object({
  token: z.string().min(16).max(128),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).nullish(),
});

/** Public: accept an invite — set password, activate, sign in. */
export async function acceptInvite(req: Request, res: Response) {
  const data = acceptSchema.parse(req.body);
  const user = await findByInviteToken(data.token);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(data.password, 12),
      firstName: data.firstName.trim(),
      lastName: data.lastName?.trim() || null,
      emailVerified: true,
      status: 'approved',
      inviteToken: null,
      inviteTokenExpires: null,
    },
  });
  res.json({
    token: signToken(updated.id),
    user: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      firstName: updated.firstName,
    },
  });
}

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  sub?: string;
  given_name?: string;
  family_name?: string;
}

const googleSchema = z.object({ credential: z.string().min(20) });

/**
 * Google SSO. Verifies the ID token against Google's tokeninfo endpoint.
 * Unknown emails land on the waitlist — SSO never bypasses invite-only.
 */
export async function googleAuth(req: Request, res: Response) {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Google sign-in is not configured');
  const { credential } = googleSchema.parse(req.body);

  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );
  if (!resp.ok) throw new HttpError(401, 'Google sign-in failed — try again');
  const info = (await resp.json()) as GoogleTokenInfo;
  if (info.aud !== env.GOOGLE_CLIENT_ID) throw new HttpError(401, 'Google token mismatch');
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (!info.email || !verified || !info.sub) {
    throw new HttpError(401, 'Google account has no verified email');
  }
  const email = info.email.toLowerCase();

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: info.sub }, { email }] },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        googleId: info.sub,
        firstName: info.given_name ?? null,
        lastName: info.family_name ?? null,
        status: 'waitlist',
        emailVerified: true,
      },
    });
  } else if (!user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: info.sub,
        emailVerified: true,
        firstName: user.firstName ?? info.given_name ?? null,
        lastName: user.lastName ?? info.family_name ?? null,
      },
    });
  }

  // Bootstrap admins ride straight through, like password login.
  if (env.ADMIN_EMAILS.includes(email) && user.status !== 'approved') {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { status: 'approved', role: 'admin', emailVerified: true },
    });
  }

  if (user.status === 'suspended') throw new HttpError(403, 'This account is suspended');
  if (user.status !== 'approved') {
    return res.status(403).json({
      error: "You're on the waitlist — we'll email you when your spot opens.",
      waitlisted: true,
    });
  }

  res.json({
    token: signToken(user.id),
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      firstName: user.firstName,
    },
  });
}
