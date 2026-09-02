import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { personOf } from '../lib/people';

// Safety: the ways out of an unwanted presence. Mute (quiet, one way, for a
// while), remove a follower, block (both ways, and every follow between you
// goes), and report (a note to the house). None of these tell the other
// person anything.

async function userByHandle(handle: string) {
  const user = await prisma.user.findUnique({
    where: { handle: handle.toLowerCase() },
    select: { id: true, handle: true, firstName: true, lastName: true },
  });
  if (!user) throw new HttpError(404, 'No one goes by that handle');
  return user;
}

// POST /users/:handle/block
export async function blockUser(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const target = await userByHandle(String(req.params.handle));
  if (target.id === me) throw new HttpError(400, "You can't block yourself");
  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId: target.id } },
      create: { blockerId: me, blockedId: target.id },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: { OR: [{ followerId: me, followingId: target.id }, { followerId: target.id, followingId: me }] },
    }),
    // A block supersedes a mute.
    prisma.mute.deleteMany({ where: { muterId: me, mutedId: target.id } }),
  ]);
  res.json({ blocked: true });
}

// DELETE /users/:handle/block
export async function unblockUser(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));
  await prisma.block.deleteMany({ where: { blockerId: req.user.id, blockedId: target.id } });
  res.json({ blocked: false });
}

const muteSchema = z.object({
  // Days to mute for; omit for indefinitely.
  days: z.number().int().min(1).max(365).optional(),
});

// POST /users/:handle/mute
export async function muteUser(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const target = await userByHandle(String(req.params.handle));
  if (target.id === me) throw new HttpError(400, "You can't mute yourself");
  const { days } = muteSchema.parse(req.body ?? {});
  const until = days ? new Date(Date.now() + days * 86_400_000) : null;
  const mute = await prisma.mute.upsert({
    where: { muterId_mutedId: { muterId: me, mutedId: target.id } },
    create: { muterId: me, mutedId: target.id, until },
    update: { until },
  });
  res.json({ muted: true, until: mute.until });
}

// DELETE /users/:handle/mute
export async function unmuteUser(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));
  await prisma.mute.deleteMany({ where: { muterId: req.user.id, mutedId: target.id } });
  res.json({ muted: false });
}

// DELETE /users/:handle/follower — they no longer follow you.
export async function removeFollower(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));
  await prisma.follow.deleteMany({ where: { followerId: target.id, followingId: req.user.id } });
  res.status(204).send();
}

// GET /social/hidden — who you've muted or blocked, so you can undo it.
export async function listHidden(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const now = new Date();
  const [blocks, mutes] = await Promise.all([
    prisma.block.findMany({
      where: { blockerId: me },
      include: { blocked: { select: { handle: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.mute.findMany({
      where: { muterId: me, OR: [{ until: null }, { until: { gt: now } }] },
      include: { muted: { select: { handle: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json({
    blocked: blocks.map((b) => ({ ...personOf(b.blocked), since: b.createdAt })),
    muted: mutes.map((m) => ({ ...personOf(m.muted), until: m.until })),
  });
}

const REPORT_REASONS = ['spam', 'impersonation', 'harassment', 'not_their_clothes', 'other'] as const;

const reportSchema = z.object({
  targetType: z.enum(['user', 'look', 'verdict', 'pick', 'comment']),
  targetId: z.string().min(1).max(80),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(500).optional(),
});

// POST /reports
export async function createReport(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const data = reportSchema.parse(req.body);
  // A user report is addressed by handle from the client; store the id.
  let targetId = data.targetId;
  if (data.targetType === 'user') targetId = (await userByHandle(data.targetId)).id;
  await prisma.report.create({
    data: {
      reporterId: req.user.id,
      targetType: data.targetType,
      targetId,
      reason: data.reason,
      detail: data.detail?.trim() || null,
    },
  });
  res.status(201).json({ ok: true });
}

// ---- Admin -----------------------------------------------------------------

// GET /admin/reports — open first.
export async function listReports(_req: Request, res: Response) {
  const rows = await prisma.report.findMany({
    orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    take: 200,
    include: { reporter: { select: { handle: true, email: true } } },
  });
  // Resolve user targets to handles so the panel reads as people.
  const userIds = rows.filter((r) => r.targetType === 'user').map((r) => r.targetId);
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, handle: true, email: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({
    reports: rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      target: r.targetType === 'user' ? (byId.get(r.targetId)?.handle ?? byId.get(r.targetId)?.email ?? r.targetId) : r.targetId,
      reason: r.reason,
      detail: r.detail,
      reporter: r.reporter.handle ?? r.reporter.email,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    })),
  });
}

// POST /admin/reports/:id/resolve
export async function resolveReport(req: Request, res: Response) {
  const id = String(req.params.id);
  const r = await prisma.report.update({ where: { id }, data: { resolvedAt: new Date() } }).catch(() => null);
  if (!r) throw new HttpError(404, 'Report not found');
  res.json({ ok: true });
}

const invitesSchema = z.object({ invitesLeft: z.number().int().min(0).max(1000) });

// POST /admin/users/:id/invites — top up (or take away) someone's invites.
export async function setInvites(req: Request, res: Response) {
  const id = String(req.params.id);
  const { invitesLeft } = invitesSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id }, data: { invitesLeft }, select: { id: true, invitesLeft: true } }).catch(() => null);
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user });
}
