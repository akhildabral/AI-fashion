import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import { sendPasswordResetEmail } from '../lib/mailer';
import { displayName, ensureHandle } from '../lib/people';
import { clientSchema, issueTokens, revokeAllSessions, type ClientInfo } from '../lib/session';
import { verifyAppleIdentityToken } from '../lib/apple';

// Invite-only onboarding: nobody self-creates an account. Joining the
// waitlist logs an email; an admin approval mints an invite link; the link
// sets a password and activates. Google and Apple SSO land on the same
// waitlist. Every endpoint that signs someone in also takes `client:
// 'mobile'` (+ `deviceName`) and then returns a refresh token too.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function publicOrigin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
  return env.PUBLIC_ORIGIN ?? `${proto}://${req.get('host')}`;
}

/** Frontend bootstrap config (public). */
export function authConfig(_req: Request, res: Response) {
  res.json({
    // The first id is the web client's; the apps find their own in the list.
    googleClientId: env.GOOGLE_CLIENT_IDS[0] ?? null,
    googleClientIds: env.GOOGLE_CLIENT_IDS,
    appleBundleIds: env.APPLE_BUNDLE_IDS,
  });
}

/** The signed-in shape every door returns. */
async function signedIn(
  user: { id: string; email: string; role: string; status: string; firstName: string | null; tokenVersion: number },
  client: ClientInfo,
) {
  const { token, refreshToken } = await issueTokens(user, client);
  return {
    token,
    ...(refreshToken ? { refreshToken } : {}),
    user: { id: user.id, email: user.email, role: user.role, status: user.status, firstName: user.firstName },
  };
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
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).nullish(),
});

/** Public: accept an invite — set password, activate, sign in. */
export async function acceptInvite(req: Request, res: Response) {
  const data = acceptSchema.parse(req.body);
  const client = clientSchema.parse(req.body);
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
  await ensureHandle(updated.id);
  res.json(await signedIn(updated, client));
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
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// POST /auth/reset — set the new password and sign in. Every other device
// is signed out: the token version moves and the app sessions are revoked.
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = resetSchema.parse(req.body);
  const client = clientSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { resetToken: token } });
  if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
    throw new HttpError(400, 'This link has expired — ask for a fresh one');
  }
  if (user.status === 'suspended') throw new HttpError(403, 'This account is suspended');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12), resetToken: null, resetTokenExpires: null, emailVerified: true, tokenVersion: { increment: 1 } },
  });
  await revokeAllSessions(updated.id);
  if (updated.status !== 'approved') {
    // Password changed, but the door is still closed for them.
    res.json({ token: null, user: null, message: 'Your password is set. Your spot opens with your invite.' });
    return;
  }
  res.json(await signedIn(updated, client));
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
      select: { handle: true, firstName: true, lastName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const origin = publicOrigin(req);
  res.json({
    code,
    url: `${origin}/join/${code}`,
    profileUrl: me?.handle ? `${origin}/u/${me.handle}` : null,
    left: me?.role === 'admin' ? null : (me?.invitesLeft ?? 0),
    used: invitees.map((i) => ({ handle: i.handle, firstName: i.firstName, name: displayName(i), joinedAt: i.createdAt })),
  });
}

// GET /auth/join/:code (public) — who's inviting, and whether the door is open.
export async function joinInfo(req: Request, res: Response) {
  const inviter = await inviterByCode(String(req.params.code));
  res.json({
    inviter: { handle: inviter.handle, firstName: inviter.firstName, name: displayName(inviter) },
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
  await ensureHandle(userId);
  await prisma.follow.createMany({
    data: [
      { followerId: userId, followingId: inviter.id },
      { followerId: inviter.id, followingId: userId },
    ],
    skipDuplicates: true,
  });
  void notify(inviter.id, 'invite_joined', userId).catch(() => undefined);
}

const joinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).nullish(),
});

// POST /auth/join/:code (public) — come in on a friend's invite.
export async function joinWithCode(req: Request, res: Response) {
  const inviter = await inviterByCode(String(req.params.code));
  if (!invitesOpen(inviter)) throw new HttpError(410, 'This invite has been used up');
  const data = joinSchema.parse(req.body);
  const client = clientSchema.parse(req.body);
  const email = data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.status === 'approved') throw new HttpError(409, 'You’re already a member — sign in instead');
  if (existing?.status === 'suspended') throw new HttpError(403, 'This account is suspended');
  // An unauthenticated join must never overwrite an account that already has a
  // way in — a password, a Google login, or a standing invite. Claiming one
  // would be a takeover of someone else's email. They use their own path.
  if (existing && (existing.passwordHash || existing.googleId || existing.inviteToken)) {
    throw new HttpError(409, 'That email already has an account — sign in, or open the link we emailed you.');
  }

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
    ...(await signedIn({ ...user, status: 'approved' }, client)),
    inviter: { handle: inviter.handle },
  });
}

// ---- SSO: Google and Apple, through the same gate ---------------------------

type SsoUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>;

/**
 * The part of SSO that is the same whichever provider vouched for them:
 * bootstrap admins come straight in, the suspended stay out, a friend's
 * code opens the door, and everyone else waits on the list.
 */
async function finishSso(res: Response, user: SsoUser, joinCode: string | undefined, client: ClientInfo) {
  // Bootstrap admins ride straight through, like password login.
  if (env.ADMIN_EMAILS.includes(user.email) && user.status !== 'approved') {
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

  if (user.status === 'approved') await ensureHandle(user.id);
  if (user.status !== 'approved') {
    return res.status(403).json({
      error: "You're on the waitlist — we'll email you when your spot opens.",
      waitlisted: true,
    });
  }

  res.json(await signedIn(user, client));
}

const googleSchema = z.object({
  credential: z.string().min(20),
  // Present when Google sign-in happens on a /join/:code page.
  joinCode: z.string().min(4).max(40).optional(),
});

/**
 * Google SSO. Verifies the ID token against Google's tokeninfo endpoint; the
 * token may be issued for any of our client ids (web, iOS, Android).
 * Unknown emails land on the waitlist — SSO never bypasses invite-only.
 */
export async function googleAuth(req: Request, res: Response) {
  if (env.GOOGLE_CLIENT_IDS.length === 0) throw new HttpError(503, 'Google sign-in is not configured');
  const { credential, joinCode } = googleSchema.parse(req.body);
  const client = clientSchema.parse(req.body);

  // Capped: a stalled Google must fail the sign-in, not hold the request.
  let resp: globalThis.Response;
  try {
    resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, 'Google sign-in took too long — try again');
  }
  if (!resp.ok) throw new HttpError(401, 'Google sign-in failed — try again');
  const info = (await resp.json()) as GoogleTokenInfo;
  if (!info.aud || !env.GOOGLE_CLIENT_IDS.includes(info.aud)) throw new HttpError(401, 'Google token mismatch');
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

  return finishSso(res, user, joinCode, client);
}

const appleSchema = z.object({
  identityToken: z.string().min(20),
  // Apple hands the name to the app once, on the first sign-in, never to us.
  fullName: z
    .object({ givenName: z.string().max(60).nullish(), familyName: z.string().max(60).nullish() })
    .nullish(),
  joinCode: z.string().min(4).max(40).optional(),
});

/**
 * Sign in with Apple. Verifies the identity token against Apple's keys and
 * our bundle ids, then takes the same path as Google: matched by Apple id
 * or by email, created on the waitlist when unknown.
 */
export async function appleAuth(req: Request, res: Response) {
  const { identityToken, fullName, joinCode } = appleSchema.parse(req.body);
  const client = clientSchema.parse(req.body);
  const identity = await verifyAppleIdentityToken(identityToken);

  let user = await prisma.user.findFirst({
    where: { OR: [{ appleSub: identity.sub }, ...(identity.email ? [{ email: identity.email }] : [])] },
  });

  const givenName = fullName?.givenName?.trim() || null;
  const familyName = fullName?.familyName?.trim() || null;

  if (!user) {
    // A returning Apple id always carries the email; a brand-new one must too.
    if (!identity.email || !identity.emailVerified) throw new HttpError(401, 'Apple account has no verified email');
    user = await prisma.user.create({
      data: {
        email: identity.email,
        appleSub: identity.sub,
        firstName: givenName,
        lastName: familyName,
        status: 'waitlist',
        emailVerified: true,
      },
    });
  } else if (!user.appleSub || (!user.firstName && givenName)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        appleSub: identity.sub,
        emailVerified: true,
        firstName: user.firstName ?? givenName,
        lastName: user.lastName ?? familyName,
      },
    });
  }

  return finishSso(res, user, joinCode, client);
}
