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
import { shareRouter } from './routes/share.routes';
import { bootstrap } from './controllers/bootstrap.controller';
import path from 'node:path';
import fs from 'node:fs';
import { isLocalStorage, UPLOADS_DIR } from './lib/storage';
import { userOrIpKey } from './lib/rate-keys';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';

// The API's own version, from package.json (next to src/ in dev, dist/ in prod).
function apiVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
const VERSION = apiVersion();

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
  // Rate limiting is scoped by cost, not one blanket ceiling over everything.
  //  - Reads (GET/HEAD) are cheap and per-user — refresh, navigation and
  //    polling dominate them, so they get a high ceiling normal use never
  //    reaches. Moving fast between pages must never rate-limit.
  //  - Writes are the risky surface (uploads, renders, votes, settings) and
  //    stay on a tight ceiling.
  // Credential routes (auth) and the public share/vote pages carry their own
  // stricter limiters on top; AI generation is additionally capped by quota.
  // Both are counted per signed-in account (a genuine bearer token names
  // one), else per address, so a shared address never shares a ceiling.
  const isRead = (req: express.Request) =>
    req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  const limiterKey = userOrIpKey(env.JWT_SECRET);
  const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests — slow down a little' },
    keyGenerator: limiterKey,
    skip: (req) => !isRead(req),
  });
  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests — slow down a little' },
    keyGenerator: limiterKey,
    skip: (req) => isRead(req),
  });
  app.use('/api', readLimiter, writeLimiter);

  // Liveness, plus what the app checks on launch: the API version and the
  // oldest app version still served.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION, minSupportedClient: env.MIN_SUPPORTED_CLIENT });
  });
  // The app's first call: the home screen in one round trip.
  app.get('/api/bootstrap', requireAuth, bootstrap);

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
  app.use('/api', shareRouter);
  // The public share/vote HTML pages sit outside /api, so give them their own
  // ceiling — each does DB work and must not be a free DoS lever.
  const shareLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: 'Too many requests',
    // These routers are mounted without a path prefix, so this middleware runs
    // for every request that reaches it (wearlog/tryon/looks routes and 404s).
    // Scope it to the actual public pages so it never throttles the app itself.
    skip: (req) => !req.path.startsWith('/vote/') && !req.path.startsWith('/look/'),
  });
  app.use(shareLimiter, votePageRouter);
  app.use(shareLimiter, lookPageRouter);
  app.use('/api', wearLogRouter);
  app.use('/api', tryOnRouter);
  app.use('/api', looksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
