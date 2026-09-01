import { Router } from 'express';
import { cancel, checkout, summary, webhook } from '../controllers/billing.controller';
import { requireAuth } from '../middleware/auth';

export const billingRouter = Router();

billingRouter.get('/billing/summary', requireAuth, summary);
billingRouter.post('/billing/checkout', requireAuth, checkout);
billingRouter.post('/billing/cancel', requireAuth, cancel);
// Unauthenticated by design — Razorpay calls it; the HMAC signature is the auth.
billingRouter.post('/billing/webhook', webhook);
