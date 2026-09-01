import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me, register, resend, updateMe, verify } from '../controllers/auth.controller';
import {
  acceptInvite,
  authConfig,
  googleAuth,
  inviteInfo,
  joinWaitlist,
} from '../controllers/invite.controller';
import { requireAuth } from '../middleware/auth';

// Credential endpoints get a strict limiter: brute force and signup spam are
// the first things any public app sees.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts — try again in a few minutes' },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, register);
authRouter.post('/login', authLimiter, login);
authRouter.get('/verify-email', authLimiter, verify);
authRouter.post('/resend-verification', authLimiter, resend);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/me', requireAuth, updateMe);
authRouter.get('/config', authConfig);
authRouter.post('/google', authLimiter, googleAuth);
authRouter.post('/waitlist', authLimiter, joinWaitlist);
authRouter.get('/invite', authLimiter, inviteInfo);
authRouter.post('/invite/accept', authLimiter, acceptInvite);
