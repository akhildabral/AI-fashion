import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

const SECRET = 'test-secret-that-is-long-enough-1234';
vi.mock('../config/env', () => ({ env: { JWT_SECRET: 'test-secret-that-is-long-enough-1234', JWT_EXPIRES_IN: '7d', JWT_EXPIRES_IN_WEB: '1h' } }));
vi.mock('./prisma', () => ({ prisma: { session: { create: mocks.create, findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));

import { hashRefreshToken, issueTokens, refreshSession, revokeAllSessions, revokeSession } from './session';
import { HttpError } from '../middleware/error';

const user = { id: 'u1', tokenVersion: 3 };
const liveSession = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  userId: 'u1',
  tokenHash: 'h',
  platform: 'mobile',
  deviceName: 'iPhone',
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  user: { id: 'u1', status: 'approved', emailVerified: true, tokenVersion: 3 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe('issueTokens', () => {
  it('gives the web only an access token and writes nothing', async () => {
    const out = await issueTokens(user);
    expect(out.refreshToken).toBeUndefined();
    expect(jwt.verify(out.token, SECRET)).toMatchObject({ sub: 'u1', tv: 3 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('gives a web client that opts in a refresh token and the web lifetime', async () => {
    const out = await issueTokens(user, { client: 'web' });
    expect(out.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', platform: 'web', tokenHash: hashRefreshToken(out.refreshToken!) });
    const claims = jwt.verify(out.token, SECRET) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it('keeps the legacy lifetime for callers that send no client', async () => {
    const claims = jwt.verify((await issueTokens(user)).token, SECRET) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(7 * 86_400);
  });

  it('gives the app a refresh token and stores only its hash', async () => {
    const out = await issueTokens(user, { client: 'mobile', deviceName: 'iPhone' });
    expect(out.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashRefreshToken(out.refreshToken!));
    expect(data.tokenHash).not.toContain(out.refreshToken);
    expect(data).toMatchObject({ userId: 'u1', platform: 'mobile', deviceName: 'iPhone' });
    // Ninety days, give or take the test's own clock.
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(89 * 86_400_000);
  });
});

describe('refreshSession', () => {
  it('rotates: revokes the presented row and writes a new one', async () => {
    mocks.findUnique.mockResolvedValue(liveSession());
    const out = await refreshSession('old-token-old-token-old');
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashRefreshToken('old-token-old-token-old') } }));
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1', revokedAt: null } }));
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(out.refreshToken).not.toBe('old-token-old-token-old');
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', deviceName: 'iPhone', tokenHash: hashRefreshToken(out.refreshToken) });
    expect(jwt.verify(out.token, SECRET)).toMatchObject({ sub: 'u1', tv: 3 });
  });

  it('signs the refreshed access token with the lifetime of the row\'s platform', async () => {
    mocks.findUnique.mockResolvedValue(liveSession({ platform: 'web' }));
    const out = await refreshSession('web-token-web-token-web');
    const claims = jwt.verify(out.token, SECRET) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(3600);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ platform: 'web' });
  });

  it('rejects a token that was already used', async () => {
    mocks.findUnique.mockResolvedValue(liveSession({ revokedAt: new Date() }));
    await expect(refreshSession('reused')).rejects.toMatchObject({ status: 401 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown or expired token', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(refreshSession('nope')).rejects.toBeInstanceOf(HttpError);
    mocks.findUnique.mockResolvedValue(liveSession({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(refreshSession('stale')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when the account lost access', async () => {
    mocks.findUnique.mockResolvedValue(liveSession({ user: { id: 'u1', status: 'suspended', emailVerified: true, tokenVersion: 3 } }));
    await expect(refreshSession('t')).rejects.toMatchObject({ status: 401 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('lets only one of two racing refreshes win', async () => {
    mocks.findUnique.mockResolvedValue(liveSession());
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(refreshSession('t')).rejects.toMatchObject({ status: 401 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('revoking', () => {
  it('revokes one device by its token, scoped to the owner', async () => {
    await revokeSession('u1', 'tok');
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', tokenHash: hashRefreshToken('tok'), revokedAt: null } }));
  });

  it('revokes every live device', async () => {
    await revokeAllSessions('u1');
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }));
  });
});
