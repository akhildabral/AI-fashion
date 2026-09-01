import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { HttpError } from './error';

interface JwtPayload {
  sub: string;
}

// Requires a valid Bearer token AND a live, approved account. The DB check on
// every request is deliberate: suspending a user revokes access immediately,
// instead of their JWT staying valid until it expires.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Missing or malformed Authorization header');
    }

    const token = header.slice('Bearer '.length);
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, emailVerified: true },
    });
    if (!user || !user.emailVerified || user.status !== 'approved') {
      throw new HttpError(401, 'This account does not currently have access');
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Admin-only endpoints; use after requireAuth.
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    throw new HttpError(403, 'Admin access required');
  }
  next();
}
