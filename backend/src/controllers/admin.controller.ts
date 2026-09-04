import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { mintInvite, publicOrigin } from './invite.controller';
import { sendInviteEmail } from '../lib/mailer';
import { revokeAllSessions } from '../lib/session';

// Admin panel backend: the app is waitlist-gated, so a superuser reviews
// accounts and grants (or revokes) access. Route-guarded by requireAdmin.

export async function listUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      email: true,
      handle: true,
      role: true,
      status: true,
      emailVerified: true,
      firstName: true,
      lastName: true,
      googleId: true,
      plan: true,
      planStatus: true,
      createdAt: true,
      invitesLeft: true,
      invitedBy: { select: { handle: true, email: true } },
      _count: { select: { wardrobe: true, wearLogs: true, invitees: true } },
    },
  });

  // AI calls in the last 7 days, for cost visibility.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const usage = await prisma.usageEvent.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const usageByUser = new Map(usage.map((u) => [u.userId, u._count._all]));

  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      handle: u.handle,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerified,
      firstName: u.firstName,
      lastName: u.lastName,
      viaGoogle: Boolean(u.googleId),
      plan: u.plan,
      planStatus: u.planStatus,
      createdAt: u.createdAt,
      items: u._count.wardrobe,
      wears: u._count.wearLogs,
      aiCalls7d: usageByUser.get(u.id) ?? 0,
      invitesLeft: u.invitesLeft,
      invited: u._count.invitees,
      invitedBy: u.invitedBy ? (u.invitedBy.handle ? `@${u.invitedBy.handle}` : u.invitedBy.email) : null,
    })),
  });
}

async function setStatus(req: Request, res: Response, status: 'approved' | 'suspended') {
  const id = String(req.params.id);
  if (id === req.user?.id && status === 'suspended') {
    throw new HttpError(400, "You can't suspend your own account");
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'User not found');
  if (user.role === 'admin' && status === 'suspended') {
    throw new HttpError(400, 'Admins cannot be suspended — demote first');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status, ...(status === 'suspended' ? { tokenVersion: { increment: 1 } } : {}) },
    select: { id: true, email: true, status: true, role: true, emailVerified: true },
  });
  // Every device goes: the token version kills live access tokens, and the
  // sessions going kills the app's way of minting new ones.
  if (status === 'suspended') await revokeAllSessions(id);
  res.json({ user: updated });
}

export function approveUser(req: Request, res: Response) {
  return setStatus(req, res, 'approved');
}

export function suspendUser(req: Request, res: Response) {
  return setStatus(req, res, 'suspended');
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// Admin-created accounts skip the email flow entirely: verified + approved
// immediately, so they can log in without SMTP being configured.
export async function createUser(req: Request, res: Response) {
  const { email, password } = createUserSchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'user',
      status: 'approved',
      emailVerified: true,
    },
    select: { id: true, email: true, role: true, status: true, emailVerified: true },
  });
  res.status(201).json({ user });
}

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export async function resetPassword(req: Request, res: Response) {
  const id = String(req.params.id);
  const { password } = resetPasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'User not found');
  if (user.role === 'admin' && user.id !== req.user?.id) {
    throw new HttpError(400, "You can't reset another admin's password");
  }

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } },
  });
  await revokeAllSessions(id);
  res.json({ ok: true });
}

// Manual verification for when the user never got the email (no SMTP yet).
export async function markVerified(req: Request, res: Response) {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'User not found');

  const updated = await prisma.user.update({
    where: { id },
    data: { emailVerified: true, verifyToken: null, verifyTokenExpires: null },
    select: { id: true, email: true, role: true, status: true, emailVerified: true },
  });
  res.json({ user: updated });
}

const setPlanSchema = z.object({ plan: z.enum(['free', 'plus', 'pro', 'premium', 'founder']) });

// Manual plan override for support cases (comps, refunds, founder grants).
// Doesn't touch the gateway — cancel there separately if a paid sub exists.
export async function setPlan(req: Request, res: Response) {
  const id = String(req.params.id);
  const { plan } = setPlanSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'User not found');

  const updated = await prisma.user.update({
    where: { id },
    data: { plan, planStatus: plan === 'free' ? 'none' : user.planStatus },
    select: { id: true, email: true, plan: true, planStatus: true },
  });
  res.json({ user: updated });
}

// ---- Invite-only onboarding ------------------------------------------------

/** Approve a waitlist/pending user: mint an invite link, email it, return it. */
export async function approveAndInvite(req: Request, res: Response) {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'User not found');

  // Google-linked accounts don't need a password — approve them directly.
  if (user.googleId) {
    const updated = await prisma.user.update({
      where: { id },
      data: { status: 'approved', emailVerified: true },
    });
    return res.json({ user: { id: updated.id, status: updated.status }, inviteUrl: null, viaGoogle: true });
  }

  const inviteUrl = await mintInvite(id, publicOrigin(req));
  const emailed = await sendInviteEmail(user.email, inviteUrl).catch((err: unknown) => {
    console.error(`[mailer] invite email to ${user.email} failed:`, err);
    return false;
  });
  res.json({ user: { id, status: 'invited' }, inviteUrl, viaGoogle: false, emailed });
}

const inviteEmailSchema = z.object({ email: z.string().email() });

/** Invite someone directly by email (creates the row if needed). */
export async function inviteByEmail(req: Request, res: Response) {
  const { email } = inviteEmailSchema.parse(req.body);
  const normalized = email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalized } });
  if (user && user.status === 'approved') {
    throw new HttpError(400, 'That person already has access');
  }
  if (!user) {
    user = await prisma.user.create({
      data: { email: normalized, status: 'waitlist', emailVerified: false },
    });
  }
  const inviteUrl = await mintInvite(user.id, publicOrigin(req));
  const emailed = await sendInviteEmail(normalized, inviteUrl).catch((err: unknown) => {
    console.error(`[mailer] invite email to ${normalized} failed:`, err);
    return false;
  });
  res.json({ inviteUrl, email: normalized, emailed });
}

/**
 * Maintenance: re-matte existing garment display images to transparent
 * cutouts. Older items were stored as white-studio product shots (opaque
 * white background); this re-runs local matting on the stored display image
 * — free, no model/API calls beyond the local matte — so garments float in
 * the UI's lit niche instead of reading as a white box. Idempotent-ish:
 * an already-transparent cutout re-mattes to itself; a matte the model is
 * unsure about is skipped and the item is left untouched.
 */
export async function rematteCutouts(_req: Request, res: Response) {
  const { readStored, saveImageBuffer, deleteFile } = await import('../lib/storage');
  const { removeBackground } = await import('../services/matting.service');

  const items = await prisma.wardrobeItem.findMany({
    select: { id: true, imageUrl: true, originalUrl: true },
  });

  let processed = 0;
  let converted = 0;
  let skipped = 0;
  for (const it of items) {
    if (!it.imageUrl) continue;
    processed++;
    try {
      const buf = await readStored(it.imageUrl);
      const matted = await removeBackground(buf);
      if (!matted || matted.coverage > 0.7) {
        skipped++;
        continue;
      }
      const stored = await saveImageBuffer(matted.png, 'png');
      const previous = it.imageUrl;
      await prisma.wardrobeItem.update({
        where: { id: it.id },
        data: { imageUrl: stored.url },
      });
      if (previous !== it.originalUrl) {
        await deleteFile(previous).catch(() => undefined);
      }
      converted++;
    } catch (err) {
      console.error(`[rematte] item ${it.id} failed:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  res.json({ processed, converted, skipped });
}
