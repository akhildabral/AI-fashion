import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { HttpError } from './error';

interface JwtPayload {
  sub: string;
  email: string;
}

// Requires a valid Bearer token; attaches `req.user`.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
}
