import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({
  env: {
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
    RAZORPAY_PLAN_PLUS: 'plan_plus_id',
    RAZORPAY_PLAN_PRO: 'plan_pro_id',
  },
}));
vi.mock('../lib/prisma', () => ({ prisma: {} }));

import { billingConfigured, verifyWebhookSignature } from './billing.service';
import { planLimits, PLAN_LIMITS } from './entitlements.service';

describe('webhook signature verification', () => {
  const body = Buffer.from(JSON.stringify({ event: 'subscription.activated' }));
  const sign = (secret: string) => createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a correctly signed body', () => {
    expect(verifyWebhookSignature(body, sign('whsec_test'))).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    expect(verifyWebhookSignature(body, sign('attacker'))).toBe(false);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(JSON.stringify({ event: 'subscription.activated', x: 1 }));
    expect(verifyWebhookSignature(tampered, sign('whsec_test'))).toBe(false);
  });

  it('reports billing configured with keys present', () => {
    expect(billingConfigured()).toBe(true);
  });
});

describe('plan limits', () => {
  it('falls back to free for unknown plans', () => {
    expect(planLimits('nonsense')).toEqual(PLAN_LIMITS.free);
  });

  it('free is a lifetime allowance, paid plans are periodic', () => {
    expect(PLAN_LIMITS.free.lifetime).toBe(true);
    expect(PLAN_LIMITS.plus.lifetime).toBe(false);
    expect(PLAN_LIMITS.pro.lifetime).toBe(false);
  });

  it('tiers are strictly increasing', () => {
    for (const key of ['items', 'looks', 'tryons', 'catalog'] as const) {
      expect(PLAN_LIMITS.free[key]).toBeLessThan(PLAN_LIMITS.plus[key]);
      expect(PLAN_LIMITS.plus[key]).toBeLessThan(PLAN_LIMITS.pro[key]);
    }
  });

  it('founder matches pro limits', () => {
    expect(PLAN_LIMITS.founder.items).toBe(PLAN_LIMITS.pro.items);
    expect(PLAN_LIMITS.founder.looks).toBe(PLAN_LIMITS.pro.looks);
  });
});
