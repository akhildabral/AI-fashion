import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

// A typed application error that controllers/services can throw.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

// Centralized error handler. Express 5 forwards rejected async handlers here.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // body-parser / multer / express errors carry a 4xx status (malformed JSON,
  // payload too large, unsupported type). Those are the caller's to fix, so
  // say what to do and don't log them as ours.
  const status = (err as { status?: unknown; statusCode?: unknown }) ?? {};
  const code = typeof status.status === 'number' ? status.status : typeof status.statusCode === 'number' ? status.statusCode : 0;
  if (code >= 400 && code < 500) {
    const type = (err as { type?: string }).type;
    const message =
      type === 'entity.parse.failed' ? 'Send valid JSON in the request body.'
      : type === 'entity.too.large' ? 'That request is too large.'
      : err instanceof Error && err.message ? err.message : 'Bad request';
    return res.status(code).json({ error: message });
  }

  // Internals stay in the log (with the request id, so a client-reported
  // failure can be found); the person gets a sentence they can act on and
  // never a stack trace.
  logger.error({ err, reqId: (req as Request & { id?: unknown }).id, method: req.method, url: req.originalUrl }, 'Unhandled error');
  const raw = err instanceof Error ? err.message : '';
  const message = /too many (clients|database connections)|ECONNREFUSED|timeout|aborted/i.test(raw)
    ? 'The stylist is out for a moment. Try again in a few seconds.'
    : 'Something went wrong on our side. Try again in a moment.';
  return res.status(500).json({ error: message });
}
