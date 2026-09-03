import type { Request, Response } from 'express';
import { env } from '../config/env';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import { renderBoard } from '../services/share.service';
import { saveImageBuffer, isStorageImageUrl } from '../lib/storage';

// Verdict polls (plan §8.1): "which of these?" — the highest-frequency social
// action in fashion, already happening in messaging groups. The share link is
// public; results are visible only to the asker; every vote is labeled taste
// data for later ranking work.

const OPTION_IDS = ['a', 'b', 'c'] as const;

interface PollOption {
  id: string;
  imageUrl: string;
  // When the option is an outfit or a look, the pieces behind the board.
  itemIds?: string[];
  label?: string;
}

const optionSchema = z.union([
  z.object({ imageUrl: z.string().min(1).max(500), label: z.string().max(60).optional() }),
  z.object({ itemIds: z.array(z.string().uuid()).min(1).max(8), label: z.string().max(60).optional() }),
]);

const createSchema = z.object({
  question: z.string().max(140).optional(),
  // Old shape (the Mirror still sends it) …
  imageUrls: z.array(z.string().min(1).max(500)).min(2).max(3).optional(),
  // … or anything: photos/renders by url, outfits and looks by their pieces.
  options: z.array(optionSchema).min(2).max(3).optional(),
  // Who it's asked of.
  audience: z.enum(['circle', 'friends', 'link']).default('circle'),
  friendHandles: z.array(z.string().min(3).max(20)).max(8).optional(),
  // Up to three days.
  expiresInMinutes: z.number().int().min(5).max(4320).default(1440),
});

function shareOrigin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
  return env.PUBLIC_ORIGIN ?? `${proto}://${req.get('host')}`;
}

function withMeta(req: Request, poll: { id: string; expiresAt: Date }) {
  return {
    shareUrl: `${shareOrigin(req)}/vote/${poll.id}`,
    expired: poll.expiresAt.getTime() < Date.now(),
  };
}

export async function createPoll(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const body = createSchema.parse(req.body);
  const raw: ({ imageUrl: string; label?: string } | { itemIds: string[]; label?: string })[] = body.options ?? (body.imageUrls ?? []).map((imageUrl) => ({ imageUrl }));
  if (raw.length < 2) throw new HttpError(400, 'Pick two or three');

  // Outfits and looks become boards; a render or a piece is already a picture.
  const options: PollOption[] = [];
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    if ('itemIds' in o) {
      const items = await prisma.wardrobeItem.findMany({ where: { id: { in: o.itemIds }, userId: me }, select: { id: true, imageUrl: true, category: true, subtype: true } });
      if (items.length === 0) throw new HttpError(400, 'Those pieces aren’t in your closet');
      const ordered = o.itemIds.map((id) => items.find((x) => x.id === id)).filter((x): x is (typeof items)[number] => Boolean(x));
      const stored = await saveImageBuffer(await renderBoard(ordered), 'jpg');
      options.push({ id: OPTION_IDS[i], imageUrl: stored.url, itemIds: ordered.map((x) => x.id), label: o.label });
    } else {
      // Only a real stored image may become a poll board. A raw client string
      // (a foreign URL, a javascript: scheme, an HTML-injection payload) is
      // refused here so it can never reach the public /vote page.
      if (!isStorageImageUrl(o.imageUrl)) throw new HttpError(400, 'That image can’t be used for a verdict');
      options.push({ id: OPTION_IDS[i], imageUrl: o.imageUrl, label: o.label });
    }
  }

  // A few friends: only people you follow, by their address.
  let audienceIds: string[] = [];
  if (body.audience === 'friends') {
    const handles = [...new Set((body.friendHandles ?? []).map((h) => h.toLowerCase()))];
    if (handles.length === 0) throw new HttpError(400, 'Pick at least one friend to ask');
    const people = await prisma.user.findMany({ where: { handle: { in: handles }, followers: { some: { followerId: me } } }, select: { id: true } });
    audienceIds = people.map((p) => p.id);
    if (audienceIds.length === 0) throw new HttpError(400, 'Ask people you follow');
  }

  const poll = await prisma.poll.create({
    data: {
      userId: me,
      question: body.question?.trim() || 'Which one should I wear?',
      options: options as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + body.expiresInMinutes * 60_000),
      audience: body.audience,
      audienceIds,
    },
  });
  for (const uid of audienceIds) void notify(uid, 'verdict_asked', me, { pollId: poll.id, target: 'verdict', targetId: poll.id, question: poll.question });

  res.status(201).json({ poll: { ...poll, votes: [], ...withMeta(req, poll) } });
}

export async function listPolls(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const polls = await prisma.poll.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { votes: { select: { optionId: true } } },
  });

  res.json({
    polls: polls.map((poll) => {
      const counts: Record<string, number> = {};
      for (const vote of poll.votes) {
        counts[vote.optionId] = (counts[vote.optionId] ?? 0) + 1;
      }
      const { votes, ...rest } = poll;
      return { ...rest, counts, totalVotes: votes.length, ...withMeta(req, poll) };
    }),
  });
}

export async function deletePoll(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const result = await prisma.poll.deleteMany({ where: { id, userId: req.user.id } });
  if (result.count === 0) throw new HttpError(404, 'Poll not found');
  await Promise.all([
    prisma.comment.deleteMany({ where: { targetType: 'verdict', targetId: id } }),
    prisma.reaction.deleteMany({ where: { targetType: 'verdict', targetId: id } }),
  ]);
  res.status(204).send();
}

// POST /polls/:id/settle — the asker closes it early; the scheduler tells everyone.
export async function settlePoll(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const poll = await prisma.poll.findFirst({ where: { id, userId: req.user.id } });
  if (!poll) throw new HttpError(404, 'Poll not found');
  if (poll.expiresAt.getTime() > Date.now()) {
    await prisma.poll.update({ where: { id }, data: { expiresAt: new Date() } });
  }
  res.json({ ok: true, settled: true });
}

// ---- Public (no auth): what a friend with the link can see and do --------

export async function getPublicPoll(req: Request, res: Response) {
  const id = String(req.params.id);
  const poll = await prisma.poll.findUnique({ where: { id } });
  if (!poll) throw new HttpError(404, 'Poll not found');

  // Options and question only — never counts. Results belong to the asker.
  res.json({
    id: poll.id,
    question: poll.question,
    options: poll.options,
    expired: poll.expiresAt.getTime() < Date.now(),
  });
}

const voteSchema = z.object({
  optionId: z.enum(OPTION_IDS),
  voterKey: z.string().min(8).max(64),
});

export async function votePoll(req: Request, res: Response) {
  const id = String(req.params.id);
  const { optionId, voterKey } = voteSchema.parse(req.body);

  const poll = await prisma.poll.findUnique({ where: { id } });
  if (!poll) throw new HttpError(404, 'Poll not found');
  if (poll.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, 'This poll has closed');
  }
  const options = poll.options as unknown as PollOption[];
  if (!options.some((o) => o.id === optionId)) {
    throw new HttpError(400, 'Unknown option');
  }

  // One vote each, changeable until it settles.
  const existing = await prisma.pollVote.findUnique({ where: { pollId_voterKey: { pollId: id, voterKey } } });
  await prisma.pollVote.upsert({
    where: { pollId_voterKey: { pollId: id, voterKey } },
    create: { pollId: id, optionId, voterKey },
    update: { optionId },
  });
  res.json({ ok: true, alreadyVoted: Boolean(existing), changed: Boolean(existing && existing.optionId !== optionId) });
}
