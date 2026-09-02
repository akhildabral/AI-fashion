import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import { sendPasswordResetEmail } from '../lib/mailer';

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

// ---- Forgotten password: a one-hour link, then straight back in -------------

const RESET_TTL_MS = 60 * 60 * 1000;

const forgotSchema = z.object({ email: z.string().email() });

// POST /auth/forgot — always the same answer, whether or not the email is ours.
export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotSchema.parse(req.body);
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (user && user.status !== 'suspended' && (user.passwordHash || user.status === 'approved')) {
    const resetToken = randomBytes(32).toString('hex');
    await prisma.user.update({ where: { id: user.id }, data: { resetToken, resetTokenExpires: new Date(Date.now() + RESET_TTL_MS) } });
    await sendPasswordResetEmail(normalized, `${publicOrigin(req)}/reset?token=${resetToken}`).catch((err) => console.error('reset mail failed:', err));
  }
  res.json({ message: 'If that address is one of ours, a link is on its way. It lasts an hour.' });
}

const resetSchema = z.object({
  token: z.string().min(16).max(128),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// POST /auth/reset — set the new password and sign in.
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = resetSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { resetToken: token } });
  if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
    throw new HttpError(400, 'This link has expired — ask for a fresh one');
  }
  if (user.status === 'suspended') throw new HttpError(403, 'This account is suspended');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12), resetToken: null, resetTokenExpires: null, emailVerified: true },
  });
  if (updated.status !== 'approved') {
    // Password changed, but the door is still closed for them.
    res.json({ token: null, user: null, message: 'Your password is set. Your spot opens with your invite.' });
    return;
  }
  res.json({
    token: signToken(updated.id),
    user: { id: updated.id, email: updated.email, role: updated.role, status: updated.status, firstName: updated.firstName },
  });
}

// ---- The door: members invite their friends ------------------------------
//
// Every member holds a standing invite link (/join/:code) good for a few
// friends. Opening it skips the waitlist: the friend lands approved,
// following the inviter both ways, with the inviter recorded. Admins are
// never limited.

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/i/l

function newCode(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

/** Every member gets one code, made the first time it's asked for. */
export async function ensureInviteCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { inviteCode: true } });
  if (u?.inviteCode) return u.inviteCode;
  for (let i = 0; i < 5; i++) {
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { inviteCode: newCode() }, select: { inviteCode: true } });
      return updated.inviteCode as string;
    } catch {
      // collision — try again
    }
  }
  throw new HttpError(500, 'Could not make an invite link');
}

type Inviter = { id: string; handle: string | null; firstName: string | null; role: string; status: string; invitesLeft: number };

function invitesOpen(u: Pick<Inviter, 'role' | 'status' | 'invitesLeft'>): boolean {
  return u.status === 'approved' && (u.role === 'admin' || u.invitesLeft > 0);
}

async function inviterByCode(code: string): Promise<Inviter> {
  const u = await prisma.user.findUnique({
    where: { inviteCode: code.toLowerCase() },
    select: { id: true, handle: true, firstName: true, role: true, status: true, invitesLeft: true },
  });
  if (!u) throw new HttpError(404, 'This invite link isn’t one of ours');
  return u;
}

/** The inviter's door, for a public page's call to action. Null when they can't invite. */
export async function joinLinkFor(userId: string, origin: string): Promise<{ url: string; handle: string | null } | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true, role: true, status: true, invitesLeft: true } });
  if (!u || !invitesOpen(u)) return null;
  const code = await ensureInviteCode(userId);
  return { url: `${origin}/join/${code}`, handle: u.handle };
}

// GET /invites/mine (auth)
export async function myInvite(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const code = await ensureInviteCode(req.user.id);
  const [me, invitees] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, invitesLeft: true, handle: true } }),
    prisma.user.findMany({
      where: { invitedById: req.user.id },
      select: { handle: true, firstName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const origin = publicOrigin(req);
  res.json({
    code,
    url: `${origin}/join/${code}`,
    profileUrl: me?.handle ? `${origin}/u/${me.handle}` : null,
    left: me?.role === 'admin' ? null : (me?.invitesLeft ?? 0),
    used: invitees.map((i) => ({ handle: i.handle, firstName: i.firstName, joinedAt: i.createdAt })),
  });
}

// GET /auth/join/:code (public) — who's inviting, and whether the door is open.
export async function joinInfo(req: Request, res: Response) {
  const inviter = await inviterByCode(String(req.params.code));
  res.json({
    inviter: { handle: inviter.handle, firstName: inviter.firstName },
    open: invitesOpen(inviter),
  });
}

/**
 * Let `userId` in on `inviter`'s invite: spend one (atomically), approve,
 * record who, follow both ways, tell the inviter. Throws 410 when the
 * inviter's invites are used up.
 */
async function redeemInvite(inviter: Inviter, userId: string): Promise<void> {
  if (inviter.status !== 'approved') throw new HttpError(410, 'This invite isn’t open right now');
  if (inviter.role !== 'admin') {
    const spent = await prisma.user.updateMany({ where: { id: inviter.id, invitesLeft: { gt: 0 } }, data: { invitesLeft: { decrement: 1 } } });
    if (spent.count === 0) throw new HttpError(410, `@${inviter.handle ?? 'your friend'} has used all their invites — ask them to get more`);
  }
  await prisma.user.update({ where: { id: userId }, data: { status: 'approved', invitedById: inviter.id } });
  await prisma.follow.createMany({
    data: [
      { followerId: userId, followingId: inviter.id },
      { followerId: inviter.id, followingId: userId },
    ],
    skipDuplicates: true,
  });
  void notify(inviter.id, 'invite_joined', userId);
}

const joinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).nullish(),
});

// POST /auth/join/:code (public) — come in on a friend's invite.
export async function joinWithCode(req: Request, res: Response) {
  const inviter = await inviterByCode(String(req.params.code));
  if (!invitesOpen(inviter)) throw new HttpError(410, 'This invite has been used up');
  const data = joinSchema.parse(req.body);
  const email = data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.status === 'approved') throw new HttpError(409, 'You’re already a member — sign in instead');
  if (existing?.status === 'suspended') throw new HttpError(403, 'This account is suspended');

  const passwordHash = await bcrypt.hash(data.password, 12);
  // Someone on the waitlist who gets a friend's link comes in on it.
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, firstName: data.firstName.trim(), lastName: data.lastName?.trim() || null, emailVerified: true, inviteToken: null, inviteTokenExpires: null },
      })
    : await prisma.user.create({
        data: { email, passwordHash, firstName: data.firstName.trim(), lastName: data.lastName?.trim() || null, emailVerified: true, status: 'pending' },
      });
  await redeemInvite(inviter, user.id);

  res.status(201).json({
    token: signToken(user.id),
    user: { id: user.id, email: user.email, role: user.role, status: 'approved', firstName: user.firstName },
    inviter: { handle: inviter.handle },
  });
}

const googleSchema = z.object({
  credential: z.string().min(20),
  // Present when Google sign-in happens on a /join/:code page.
  joinCode: z.string().min(4).max(40).optional(),
});

/**
 * Google SSO. Verifies the ID token against Google's tokeninfo endpoint.
 * Unknown emails land on the waitlist — SSO never bypasses invite-only.
 */
export async function googleAuth(req: Request, res: Response) {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Google sign-in is not configured');
  const { credential, joinCode } = googleSchema.parse(req.body);

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

  // Arrived through a friend's door: that lets them in.
  if (user.status !== 'approved' && joinCode) {
    const inviter = await inviterByCode(joinCode);
    if (!invitesOpen(inviter)) throw new HttpError(410, 'This invite has been used up');
    await redeemInvite(inviter, user.id);
    user = { ...user, status: 'approved' };
  }

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
