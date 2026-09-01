import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

// Gateway seam: everything Razorpay-specific lives here (same pattern as the
// provider-agnostic AI layer). The webhook — never the redirect — is the
// source of truth for plan changes.

export type PaidPlan = 'plus' | 'pro';

const PLAN_IDS: Record<PaidPlan, () => string | undefined> = {
  plus: () => env.RAZORPAY_PLAN_PLUS,
  pro: () => env.RAZORPAY_PLAN_PRO,
};

export function billingConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

let client: Razorpay | null = null;
function razorpay(): Razorpay {
  if (!billingConfigured()) {
    throw new HttpError(503, 'Billing is not configured yet');
  }
  if (!client) {
    client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID!,
      key_secret: env.RAZORPAY_KEY_SECRET!,
    });
  }
  return client;
}

/**
 * Create a Razorpay subscription for the user and return what the web
 * checkout needs. The user's id travels in `notes` so webhooks can always
 * be mapped back even if our stored subscription id is stale.
 */
export async function createCheckout(userId: string, email: string, plan: PaidPlan) {
  const planId = PLAN_IDS[plan]();
  if (!planId) throw new HttpError(503, `The ${plan} plan is not configured yet`);

  const subscription = await razorpay().subscriptions.create({
    plan_id: planId,
    total_count: 60, // 5 years of monthly cycles; cancellable any time
    customer_notify: 1,
    notes: { userId, plan, app: 'ai-fashion' },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { gatewaySubscriptionId: subscription.id },
  });

  return {
    subscriptionId: subscription.id,
    keyId: env.RAZORPAY_KEY_ID!,
    plan,
    email,
  };
}

/** Cancel at cycle end — the plan keeps running until the period the user paid for is over. */
export async function cancelSubscription(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.gatewaySubscriptionId) {
    throw new HttpError(400, 'No active subscription to cancel');
  }
  await razorpay().subscriptions.cancel(user.gatewaySubscriptionId, true);
  await prisma.user.update({
    where: { id: userId },
    data: { planStatus: 'cancelled' },
  });
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WebhookSubscriptionPayload {
  event: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        plan_id?: string;
        status?: string;
        current_end?: number | null;
        notes?: Record<string, string>;
        customer_id?: string;
      };
    };
  };
}

function planFromNotesOrId(notes: Record<string, string> | undefined, planId?: string): PaidPlan | null {
  if (notes?.plan === 'plus' || notes?.plan === 'pro') return notes.plan;
  if (planId && planId === env.RAZORPAY_PLAN_PLUS) return 'plus';
  if (planId && planId === env.RAZORPAY_PLAN_PRO) return 'pro';
  return null;
}

/**
 * Apply one verified webhook event. Idempotent: the eventId is recorded with
 * a unique constraint and redeliveries are ignored.
 */
export async function handleWebhookEvent(eventId: string, body: WebhookSubscriptionPayload) {
  const sub = body.payload?.subscription?.entity;
  const userId =
    sub?.notes?.userId ??
    (sub?.id
      ? (await prisma.user.findFirst({ where: { gatewaySubscriptionId: sub.id } }))?.id
      : undefined);

  // Record first (idempotency gate) — a replayed event throws on the unique
  // eventId and we bail before touching the user.
  try {
    await prisma.billingEvent.create({
      data: {
        userId: userId ?? null,
        gateway: 'razorpay',
        eventType: body.event,
        eventId,
        payload: body as object,
      },
    });
  } catch {
    return { applied: false, reason: 'duplicate' };
  }

  if (!userId || !sub) return { applied: false, reason: 'no-user' };

  const plan = planFromNotesOrId(sub.notes, sub.plan_id);
  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000) : null;

  switch (body.event) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(plan ? { plan } : {}),
          planStatus: 'active',
          currentPeriodEnd: periodEnd,
          gatewaySubscriptionId: sub.id,
          ...(sub.customer_id ? { gatewayCustomerId: sub.customer_id } : {}),
        },
      });
      break;
    case 'subscription.pending':
    case 'subscription.halted':
      // Payment failing — keep the plan but flag it; the UI shows a banner.
      await prisma.user.update({
        where: { id: userId },
        data: { planStatus: 'grace' },
      });
      break;
    case 'subscription.cancelled':
    case 'subscription.completed':
      // Access runs until the paid period ends; after that the quota checks
      // fall back to free limits because we downgrade here only when the
      // period is already over, otherwise mark cancelled and let it lapse.
      await prisma.user.update({
        where: { id: userId },
        data:
          periodEnd && periodEnd > new Date()
            ? { planStatus: 'cancelled', currentPeriodEnd: periodEnd }
            : { plan: 'free', planStatus: 'none', currentPeriodEnd: null, gatewaySubscriptionId: null },
      });
      break;
    default:
      return { applied: false, reason: 'ignored-event' };
  }
  return { applied: true };
}

/**
 * Lazy downgrade: called on billing reads. If a cancelled/halted plan's paid
 * period has lapsed, revert to free so limits enforce correctly without a cron.
 */
export async function reconcilePlan(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const lapsed =
    user.plan !== 'free' &&
    user.plan !== 'founder' &&
    user.planStatus !== 'active' &&
    user.currentPeriodEnd !== null &&
    user.currentPeriodEnd < new Date();
  if (lapsed) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: 'free', planStatus: 'none', currentPeriodEnd: null, gatewaySubscriptionId: null },
    });
  }
}
