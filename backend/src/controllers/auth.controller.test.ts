import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  userUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock('../config/env', () => ({ env: { JWT_SECRET: 'test-secret-that-is-long-enough-1234', JWT_EXPIRES_IN: '7d', ADMIN_EMAILS: [] } }));
vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { update: mocks.userUpdate },
    session: { updateMany: mocks.sessionUpdateMany, findUnique: mocks.sessionFindUnique, create: mocks.sessionCreate },
  },
}));
vi.mock('../lib/mailer', () => ({ sendVerificationEmail: vi.fn() }));
vi.mock('../lib/storage', () => ({ deleteFile: vi.fn() }));
vi.mock('../lib/people', () => ({ displayName: () => '', ensureHandle: vi.fn() }));

import { logout, refresh } from './auth.controller';
import { hashRefreshToken } from '../lib/session';

function res() {
  const r = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  r.status.mockReturnValue(r);
  return r as unknown as Response & typeof r;
}
const authed = (body: unknown = {}) => ({ user: { id: 'u1', email: 'a@b.com', role: 'user', plan: 'free' }, body }) as unknown as Request;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.userUpdate.mockResolvedValue({});
});

describe('POST /auth/logout', () => {
  it('without a body signs out everywhere by bumping the token version', async () => {
    const r = res();
    await logout(authed(), r);
    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { tokenVersion: { increment: 1 } } });
    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(204);
  });

  it('with a refresh token signs out that device only', async () => {
    const r = res();
    await logout(authed({ refreshToken: 'device-token-device-token' }), r);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', tokenHash: hashRefreshToken('device-token-device-token'), revokedAt: null } }),
    );
    expect(r.status).toHaveBeenCalledWith(204);
  });

  it('refuses without a signed-in user', async () => {
    await expect(logout({ body: {} } as Request, res())).rejects.toMatchObject({ status: 401 });
  });
});

describe('POST /auth/refresh', () => {
  it('returns a new pair for a live token', async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      id: 's1', userId: 'u1', platform: 'mobile', deviceName: null, revokedAt: null,
      expiresAt: new Date(Date.now() + 1000), user: { id: 'u1', status: 'approved', emailVerified: true, tokenVersion: 0 },
    });
    mocks.sessionCreate.mockResolvedValue({});
    const r = res();
    await refresh({ body: { refreshToken: 'live-token-live-token' } } as Request, r);
    const out = r.json.mock.calls[0][0];
    expect(typeof out.token).toBe('string');
    expect(typeof out.refreshToken).toBe('string');
    expect(out.refreshToken).not.toBe('live-token-live-token');
  });

  it('validates the body', async () => {
    await expect(refresh({ body: {} } as Request, res())).rejects.toBeTruthy();
  });
});
