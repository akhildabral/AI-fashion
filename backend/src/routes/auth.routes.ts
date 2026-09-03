import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { deleteMe, login, logout, me, refresh, register, resend, updateMe, verify } from '../controllers/auth.controller';
import {
  acceptInvite,
  appleAuth,
  authConfig,
  forgotPassword,
  resetPassword,
  googleAuth,
  inviteInfo,
  joinInfo,
  joinWaitlist,
  joinWithCode,
} from '../controllers/invite.controller';
import { requireAuth } from '../middleware/auth';
import { emailKey, ipKey } from '../lib/rate-keys';

// Credential endpoints get a strict limiter: brute force and signup spam are
// the first things any public app sees.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts — try again in a few minutes' },
  keyGenerator: ipKey,
});

// A second ceiling on the routes that name an account, counted per email:
// many people share one address on mobile networks, and one of them
// mistyping a password must not lock the others out of theirs.
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts — try again in a few minutes' },
  keyGenerator: emailKey,
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, register);
authRouter.post('/login', authLimiter, emailLimiter, login);
authRouter.get('/verify-email', authLimiter, verify);
authRouter.post('/resend-verification', authLimiter, emailLimiter, resend);
authRouter.get('/me', requireAuth, me);
authRouter.post('/logout', requireAuth, logout);
authRouter.post('/refresh', authLimiter, refresh);
authRouter.patch('/me', requireAuth, updateMe);
authRouter.delete('/me', requireAuth, deleteMe);
authRouter.get('/config', authConfig);
authRouter.post('/google', authLimiter, googleAuth);
authRouter.post('/apple', authLimiter, appleAuth);
authRouter.post('/waitlist', authLimiter, joinWaitlist);
authRouter.get('/invite', authLimiter, inviteInfo);
authRouter.post('/invite/accept', authLimiter, acceptInvite);
// A friend's door: public, rate-limited like every other credential route.
authRouter.post('/forgot', authLimiter, emailLimiter, forgotPassword);
authRouter.post('/reset', authLimiter, resetPassword);
authRouter.get('/join/:code', authLimiter, joinInfo);
authRouter.post('/join/:code', authLimiter, joinWithCode);
