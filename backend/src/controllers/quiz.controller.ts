import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { QUIZ_PAIRS, signalsFromChoices } from '../lib/quiz';
import { HttpError } from '../middleware/error';

// The pairs, with image URLs but without the signal phrases — signals are
// computed server-side on submit so the client can't invent them.
export function getQuiz(_req: Request, res: Response) {
  res.json({
    pairs: QUIZ_PAIRS.map((pair) => ({
      id: pair.id,
      question: pair.question,
      left: { label: pair.left.label, imageUrl: `/api/quiz-assets/${pair.id}-left.jpg` },
      right: { label: pair.right.label, imageUrl: `/api/quiz-assets/${pair.id}-right.jpg` },
    })),
  });
}

const submitSchema = z.object({
  choices: z.record(z.string(), z.enum(['left', 'right'])),
});

export async function submitQuiz(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { choices } = submitSchema.parse(req.body);

  const signals = signalsFromChoices(choices);
  if (signals.length === 0) {
    throw new HttpError(400, 'Answer at least one question');
  }

  const styleSignals = { signals, takenAt: new Date().toISOString() };
  const profile = await prisma.styleProfile.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, styleSignals },
    update: { styleSignals },
  });

  res.json({ profile });
}
