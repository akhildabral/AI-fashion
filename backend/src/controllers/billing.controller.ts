import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import {
  billingConfigured,
  cancelSubscription,
  createCheckout,
  handleWebhookEvent,
  reconcilePlan,
  verifyWebhookSignature,
} from '../services/billing.service';
import { usageSummary } from '../services/entitlements.service';

/** Plan, status, and usage meters for the billing page. */
export async function summary(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  await reconcilePlan(req.user.id);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user.id },
    select: { plan: true, planStatus: true, currentPeriodEnd: true },
  });
  const usage = await usageSummary(req.user.id, user.plan);
  res.json({
    ...usage,
    planStatus: user.planStatus,
    currentPeriodEnd: user.currentPeriodEnd,
    billingConfigured: billingConfigured(),
  });
}

const checkoutSchema = z.object({ plan: z.enum(['plus', 'pro']) });

export async function checkout(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { plan } = checkoutSchema.parse(req.body);
  const session = await createCheckout(req.user.id, req.user.email, plan);
  res.json(session);
}

export async function cancel(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  await cancelSubscription(req.user.id);
  res.json({ ok: true, message: 'Subscription cancelled — your plan runs until the period ends' });
}

/**
 * Razorpay webhook. Signature-verified over the raw body, idempotent by
 * event id. Always 200s on handled/ignored events so the gateway stops
 * retrying; 401 only on bad signatures.
 */
export async function webhook(req: Request, res: Response) {
  const signature = req.get('x-razorpay-signature');
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!signature || !rawBody || !verifyWebhookSignature(rawBody, signature)) {
    throw new HttpError(401, 'Invalid webhook signature');
  }

  const eventId = req.get('x-razorpay-event-id') ?? `no-id-${signature.slice(0, 32)}`;
  const result = await handleWebhookEvent(eventId, req.body);
  res.json(result);
}
