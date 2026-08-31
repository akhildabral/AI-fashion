import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.routes';
import { looksRouter } from './routes/generate.routes';
import { profileRouter } from './routes/profile.routes';
import { photoRouter } from './routes/photo.routes';
import { tryOnRouter } from './routes/tryon.routes';
import { wardrobeRouter } from './routes/wardrobe.routes';
import { wearLogRouter } from './routes/wearlog.routes';
import { quizRouter } from './routes/quiz.routes';
import { pollRouter, votePageRouter } from './routes/poll.routes';
import { socialRouter } from './routes/social.routes';
import path from 'node:path';
import { isLocalStorage, UPLOADS_DIR } from './lib/storage';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  // Behind cloudflared/reverse proxies, honor X-Forwarded-* for share links.
  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json());

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
  app.use(votePageRouter);
  app.use('/api', wearLogRouter);
  app.use('/api', tryOnRouter);
  app.use('/api', looksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
