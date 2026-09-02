import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

// Verdict polls (plan §8.1): "which of these?" — the highest-frequency social
// action in fashion, already happening in messaging groups. The share link is
// public; results are visible only to the asker; every vote is labeled taste
// data for later ranking work.

const OPTION_IDS = ['a', 'b', 'c'] as const;

interface PollOption {
  id: string;
  imageUrl: string;
}

const createSchema = z.object({
  question: z.string().max(140).optional(),
  imageUrls: z.array(z.string().min(1).max(500)).min(2).max(3),
  // Plan default is a fast-expiring poll; capped at 24h.
  expiresInMinutes: z.number().int().min(5).max(1440).default(30),
});

function shareOrigin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
  return `${proto}://${req.get('host')}`;
}

function withMeta(req: Request, poll: { id: string; expiresAt: Date }) {
  return {
    shareUrl: `${shareOrigin(req)}/vote/${poll.id}`,
    expired: poll.expiresAt.getTime() < Date.now(),
  };
}

export async function createPoll(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { question, imageUrls, expiresInMinutes } = createSchema.parse(req.body);

  const options: PollOption[] = imageUrls.map((imageUrl, i) => ({
    id: OPTION_IDS[i],
    imageUrl,
  }));

  const poll = await prisma.poll.create({
    data: {
      userId: req.user.id,
      question: question?.trim() || 'Which one should I wear?',
      options: options as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
    },
  });

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

  try {
    await prisma.pollVote.create({ data: { pollId: id, optionId, voterKey } });
  } catch (err) {
    // Unique (pollId, voterKey): this browser already voted — that's fine.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.json({ ok: true, alreadyVoted: true });
      return;
    }
    throw err;
  }

  res.json({ ok: true, alreadyVoted: false });
}
