import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { authRouter } from './routes/auth.routes';
import { looksRouter } from './routes/generate.routes';
import { profileRouter } from './routes/profile.routes';
import { photoRouter } from './routes/photo.routes';
import { tryOnRouter } from './routes/tryon.routes';
import { wardrobeRouter } from './routes/wardrobe.routes';
import { wearLogRouter } from './routes/wearlog.routes';
import { quizRouter } from './routes/quiz.routes';
import { pollRouter, votePageRouter } from './routes/poll.routes';
import { lookPageRouter } from './routes/look.routes';
import { socialRouter } from './routes/social.routes';
import { adminRouter } from './routes/admin.routes';
import { billingRouter } from './routes/billing.routes';
import { briefRouter } from './routes/brief.routes';
import { circleRouter } from './routes/circle.routes';
import { pushRouter } from './routes/push.routes';
import path from 'node:path';
import { isLocalStorage, UPLOADS_DIR } from './lib/storage';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  // Exactly one proxy hop (Caddy / the dev tunnel) — needed for correct
  // client IPs in rate limiting and X-Forwarded-* in share links.
  app.set('trust proxy', 1);
  // Security headers. CSP is off because the backend serves the standalone
  // /vote page with a small inline script; everything else applies.
  app.use(helmet({ contentSecurityPolicy: false }));
  // Browser origins: locked down when CORS_ORIGINS is set (production);
  // open in dev. Native mobile apps send no Origin and are unaffected.
  app.use(cors(env.CORS_ORIGINS.length > 0 ? { origin: env.CORS_ORIGINS } : {}));
  app.use(
    express.json({
      limit: '256kb',
      // Keep the raw bytes: webhook signatures are HMACs over the exact body.
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  // A generous global ceiling against abuse; auth has its own strict limiter.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests — slow down a little' },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve uploaded photos and generated images (local storage driver only;
  // with S3 the browser loads images straight from the bucket/CDN).
  if (isLocalStorage) {
    app.use('/api/uploads', express.static(UPLOADS_DIR));
  }

  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/photo', photoRouter);
  app.use('/api/wardrobe', wardrobeRouter);
  // Static taste-quiz pair images (committed assets, not user uploads).
  app.use('/api/quiz-assets', express.static(path.resolve(__dirname, '../assets/quiz')));

  app.use('/api', quizRouter);
  app.use('/api', pollRouter);
  app.use('/api', socialRouter);
  app.use('/api', adminRouter);
  app.use('/api', billingRouter);
  app.use('/api', briefRouter);
  app.use('/api', circleRouter);
  app.use('/api', pushRouter);
  app.use(votePageRouter);
  app.use(lookPageRouter);
  app.use('/api', wearLogRouter);
  app.use('/api', tryOnRouter);
  app.use('/api', looksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
