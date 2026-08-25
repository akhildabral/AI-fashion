import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

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
  _req: Request,
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

  console.error('Unhandled error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  return res.status(500).json({ error: message });
}
