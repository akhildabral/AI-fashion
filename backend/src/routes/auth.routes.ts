import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { deleteMe, login, logout, me, register, resend, updateMe, verify } from '../controllers/auth.controller';
import {
  acceptInvite,
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
 authRouter.post('/logout', requireAuth, logout);
authRouter.patch('/me', requireAuth, updateMe);
authRouter.delete('/me', requireAuth, deleteMe);
authRouter.get('/config', authConfig);
authRouter.post('/google', authLimiter, googleAuth);
authRouter.post('/waitlist', authLimiter, joinWaitlist);
authRouter.get('/invite', authLimiter, inviteInfo);
authRouter.post('/invite/accept', authLimiter, acceptInvite);
// A friend's door: public, rate-limited like every other credential route.
authRouter.post('/forgot', authLimiter, forgotPassword);
authRouter.post('/reset', authLimiter, resetPassword);
authRouter.get('/join/:code', authLimiter, joinInfo);
authRouter.post('/join/:code', authLimiter, joinWithCode);
