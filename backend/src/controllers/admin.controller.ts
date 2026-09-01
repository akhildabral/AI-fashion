import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

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
      plan: true,
      planStatus: true,
      createdAt: true,
      _count: { select: { wardrobe: true, wearLogs: true } },
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
      plan: u.plan,
      planStatus: u.planStatus,
      createdAt: u.createdAt,
      items: u._count.wardrobe,
      wears: u._count.wearLogs,
      aiCalls7d: usageByUser.get(u.id) ?? 0,
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
    data: { status },
    select: { id: true, email: true, status: true, role: true, emailVerified: true },
  });
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
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
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

const setPlanSchema = z.object({ plan: z.enum(['free', 'plus', 'pro', 'founder']) });

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
