import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from './prisma';
import { HttpError } from '../middleware/error';

// Two kinds of token. The access token is a short JWT every request carries
// (see middleware/auth). The refresh token is an opaque secret tied to one
// device row, exchanged for a fresh pair at /auth/refresh. Any caller that
// names itself (`client: 'mobile' | 'web'`) gets one; a caller that sends
// no `client` (the legacy web path) keeps using the access token alone.

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type ClientKind = 'mobile' | 'web';

/**
 * Access-token lifetime by client. Web sessions that opted into refresh
 * tokens get JWT_EXPIRES_IN_WEB (default 7d, i.e. unchanged until the
 * frontend adopts refresh); everything else keeps JWT_EXPIRES_IN.
 */
function accessTtl(client?: string | null): string {
  if (client === 'web') return env.JWT_EXPIRES_IN_WEB ?? env.JWT_EXPIRES_IN;
  return env.JWT_EXPIRES_IN;
}

export function signToken(userId: string, tokenVersion: number, client?: string | null): string {
  return jwt.sign({ sub: userId, tv: tokenVersion }, env.JWT_SECRET, {
    expiresIn: accessTtl(client),
    algorithm: 'HS256',
  } as SignOptions);
}

/** Optional fields every token-issuing endpoint accepts from a client. */
export const clientSchema = z.object({
  client: z.enum(['mobile', 'web']).optional(),
  deviceName: z.string().trim().min(1).max(80).optional(),
});
export type ClientInfo = z.infer<typeof clientSchema>;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The access token, plus a refresh token when the caller named itself
 * (mobile, or a web client that opted in). The refresh token is only ever
 * returned here and from /auth/refresh; the DB keeps its hash.
 */
export async function issueTokens(
  user: { id: string; tokenVersion: number },
  client: ClientInfo = {},
): Promise<{ token: string; refreshToken?: string }> {
  const token = signToken(user.id, user.tokenVersion, client.client);
  if (!client.client) return { token };
  const refreshToken = newRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      platform: client.client,
      deviceName: client.deviceName ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { token, refreshToken };
}

/**
 * Exchange a refresh token for a new pair. Rotation: the presented row is
 * revoked and a new one written under the same device name, so a token can
 * be used exactly once. A token that is expired, revoked or unknown is a 401,
 * and so is one whose account has lost access.
 */
export async function refreshSession(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: { select: { id: true, status: true, emailVerified: true, tokenVersion: true } } },
  });
  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt < now) {
    throw new HttpError(401, 'This session has ended — please sign in again');
  }
  if (!session.user.emailVerified || session.user.status !== 'approved') {
    throw new HttpError(401, 'This account does not currently have access');
  }
  // Revoke first, and only if nobody else got here: two racing refreshes
  // with the same token must not both succeed.
  const revoked = await prisma.session.updateMany({
    where: { id: session.id, revokedAt: null },
    data: { revokedAt: now, lastUsedAt: now },
  });
  if (revoked.count === 0) throw new HttpError(401, 'This session has ended — please sign in again');
  const next = newRefreshToken();
  await prisma.session.create({
    data: {
      userId: session.userId,
      tokenHash: hashRefreshToken(next),
      platform: session.platform,
      deviceName: session.deviceName,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    },
  });
  // The new access token keeps the lifetime of the platform that opened
  // the session (web rows are short-lived once the frontend uses refresh).
  return { token: signToken(session.user.id, session.user.tokenVersion, session.platform), refreshToken: next };
}

/** Sign out one device. Silent when the token is not theirs or already gone. */
export async function revokeSession(userId: string, refreshToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Sign out everywhere: every live device row of theirs is revoked. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
