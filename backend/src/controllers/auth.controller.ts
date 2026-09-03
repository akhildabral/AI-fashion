import type { Request, Response } from 'express';
import { env } from '../config/env';
import { z } from 'zod';
import {
  loginUser,
  registerUser,
  resendVerification,
  verifyEmail,
} from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { displayName, ensureHandle } from '../lib/people';
import { deleteFile } from '../lib/storage';
import { clientSchema, refreshSession, revokeSession } from '../lib/session';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// Where verification links should point — the public web origin, derived from
// forwarded headers so it works behind the proxy and in dev.
function publicOrigin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
  return env.PUBLIC_ORIGIN ?? `${proto}://${req.get('host')}`;
}

export async function register(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  // Invite-only: open self-signup is closed. Bootstrap admin emails keep
  // the original path so a fresh deployment can always mint its first admin.
  const { env } = await import('../config/env');
  if (!env.ADMIN_EMAILS.includes(email.trim().toLowerCase())) {
    throw new HttpError(403, 'ZAUQ is invite-only — join the waitlist instead');
  }
  const result = await registerUser(email, password, publicOrigin(req));
  res.status(201).json(result);
}

const nameSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).nullish(),
});

const logoutSchema = z.object({ refreshToken: z.string().min(16).max(256).optional() });

// POST /auth/logout — end the session server-side. With a refresh token in
// the body (the app), just that device's session is revoked and other
// devices stay signed in. Without one (the web), the token version rotates
// so the bearer token can't be reused on any device after sign-out.
export async function logout(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { refreshToken } = logoutSchema.parse(req.body ?? {});
  if (refreshToken) {
    await revokeSession(req.user.id, refreshToken);
  } else {
    await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
  }
  res.status(204).end();
}

const refreshSchema = z.object({ refreshToken: z.string().min(16).max(256) });

// POST /auth/refresh — a new access token and a new refresh token for the
// one presented, which is spent by this call.
export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  res.json(await refreshSession(refreshToken));
}

export async function updateMe(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const data = nameSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { firstName: data.firstName.trim(), lastName: data.lastName?.trim() || null },
    select: { id: true, email: true, role: true, status: true, handle: true, firstName: true, lastName: true },
  });
  res.json({ user });
}

export async function login(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const client = clientSchema.parse(req.body);
  const { user, token, refreshToken } = await loginUser(email, password, client);
  res.status(200).json({ token, ...(refreshToken ? { refreshToken } : {}), user });
}

const verifySchema = z.object({ token: z.string().min(16).max(128) });

export async function verify(req: Request, res: Response) {
  const { token } = verifySchema.parse({ token: req.query.token });
  const user = await verifyEmail(String(token));
  res.json({
    user,
    message:
      user.status === 'approved'
        ? 'Email verified — you can log in now.'
        : "Email verified! You're on the waitlist — we'll let you know once access is approved.",
  });
}

const resendSchema = z.object({ email: z.string().email() });

export async function resend(req: Request, res: Response) {
  const { email } = resendSchema.parse(req.body);
  await resendVerification(email, publicOrigin(req));
  // Uniform response — never reveals whether the account exists.
  res.json({ message: 'If that account needs verification, a fresh link is on its way.' });
}

/** The signed-in person, as GET /auth/me returns them. */
export async function loadMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, status: true, handle: true, firstName: true, lastName: true, emailVerified: true, plan: true, planStatus: true, googleId: true, appleSub: true, passwordHash: true, createdAt: true },
  });
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  if (!user.handle && user.status === 'approved') user.handle = await ensureHandle(user.id);
  const { googleId, appleSub, passwordHash, ...rest } = user;
  return { ...rest, name: displayName(user), hasPassword: Boolean(passwordHash), hasGoogle: Boolean(googleId), hasApple: Boolean(appleSub) };
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new HttpError(401, 'Not authenticated');
  }
  res.json({ user: await loadMe(req.user.id) });
}

// The way out. Typed confirmation, then everything goes: the account (and
// with it, by cascade, the closet, the record, the circle) and the files.
const deleteMeSchema = z.object({ confirm: z.string() });

export async function deleteMe(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { confirm } = deleteMeSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, photoPath: true } });
  if (!user) throw new HttpError(404, 'User not found');
  if (confirm.trim().toLowerCase() !== user.email.toLowerCase()) throw new HttpError(400, 'Type your email address exactly to confirm');

  const [items, logs, photos, tryOns, looks, polls, wearJobs] = await Promise.all([
    prisma.wardrobeItem.findMany({ where: { userId: req.user.id }, select: { imageUrl: true, originalUrl: true } }),
    prisma.wearLog.findMany({ where: { userId: req.user.id, photoUrl: { not: null } }, select: { photoUrl: true } }),
    prisma.userPhoto.findMany({ where: { userId: req.user.id }, select: { path: true } }),
    prisma.tryOn.findMany({ where: { userId: req.user.id }, select: { imageUrl: true } }),
    prisma.look.findMany({ where: { userId: req.user.id }, select: { imageUrl: true } }),
    prisma.poll.findMany({ where: { userId: req.user.id }, select: { options: true } }),
    prisma.wearPhotoJob.findMany({ where: { userId: req.user.id }, select: { photoUrl: true } }),
  ]);
  const files = [
    ...items.flatMap((i) => [i.imageUrl, i.originalUrl]),
    ...logs.map((l) => l.photoUrl),
    ...photos.map((p) => p.path),
    ...tryOns.map((t) => t.imageUrl),
    ...looks.map((l) => l.imageUrl),
    ...polls.flatMap((p) => ((p.options as { imageUrl?: string }[] | null) ?? []).map((o) => o.imageUrl)),
    ...wearJobs.map((w) => w.photoUrl),
    user.photoPath,
  ].filter((f): f is string => Boolean(f));

  await prisma.user.delete({ where: { id: req.user.id } });
  // Files go best-effort, after the row: a missing file must never keep an account alive.
  await Promise.allSettled(files.map((f) => deleteFile(f)));
  res.status(204).send();
}
