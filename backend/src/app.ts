import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.routes';
import { looksRouter } from './routes/generate.routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', looksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
