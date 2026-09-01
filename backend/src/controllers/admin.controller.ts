import type { Request, Response } from 'express';
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
      createdAt: true,
      _count: { select: { wardrobe: true, wearLogs: true } },
    },
  });

  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      handle: u.handle,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      items: u._count.wardrobe,
      wears: u._count.wearLogs,
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
