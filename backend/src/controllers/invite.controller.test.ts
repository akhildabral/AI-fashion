import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  issueTokens: vi.fn(),
  verifyApple: vi.fn(),
  ensureHandle: vi.fn(),
}));

vi.mock('../config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-that-is-long-enough-1234',
    JWT_EXPIRES_IN: '7d',
    ADMIN_EMAILS: [],
    GOOGLE_CLIENT_IDS: ['web-client-id', 'ios-client-id', 'android-client-id'],
    APPLE_BUNDLE_IDS: ['com.myzauq.app'],
  },
}));
vi.mock('../lib/prisma', () => ({ prisma: { user: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update } } }));
vi.mock('../lib/notify', () => ({ notify: vi.fn() }));
vi.mock('../lib/mailer', () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock('../lib/people', () => ({ displayName: () => '', ensureHandle: mocks.ensureHandle }));
vi.mock('../lib/apple', () => ({ verifyAppleIdentityToken: mocks.verifyApple }));
vi.mock('../lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/session')>()),
  issueTokens: mocks.issueTokens,
  revokeAllSessions: vi.fn(),
}));

import { appleAuth, authConfig, googleAuth } from './invite.controller';

function res() {
  const r = { status: vi.fn(), json: vi.fn() };
  r.status.mockReturnValue(r);
  return r as unknown as Response & typeof r;
}
const approved = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'meera@example.com', role: 'user', status: 'approved', firstName: 'Meera', lastName: null,
  googleId: null, appleSub: null, tokenVersion: 2, emailVerified: true, ...over,
});

const realFetch = globalThis.fetch;
function googleSays(info: Record<string, unknown>, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok, json: async () => info }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.issueTokens.mockImplementation(async (_u: unknown, client: { client?: string } = {}) =>
    client.client === 'mobile' ? { token: 'jwt', refreshToken: 'rt' } : { token: 'jwt' },
  );
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GET /auth/config', () => {
  it('lists every client id, the web one first', () => {
    const r = res();
    authConfig({} as Request, r);
    expect(r.json).toHaveBeenCalledWith({
      googleClientId: 'web-client-id',
      googleClientIds: ['web-client-id', 'ios-client-id', 'android-client-id'],
      appleBundleIds: ['com.myzauq.app'],
    });
  });
});

describe('POST /auth/google', () => {
  const body = { credential: 'x'.repeat(40) };

  it('accepts a token issued for any of our client ids', async () => {
    googleSays({ aud: 'ios-client-id', email: 'Meera@Example.com', email_verified: 'true', sub: 'g1' });
    mocks.findFirst.mockResolvedValue(approved({ googleId: 'g1' }));
    const r = res();
    await googleAuth({ body: { ...body, client: 'mobile', deviceName: 'iPhone' } } as Request, r);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { OR: [{ googleId: 'g1' }, { email: 'meera@example.com' }] } });
    expect(mocks.issueTokens).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', tokenVersion: 2 }), { client: 'mobile', deviceName: 'iPhone' });
    expect(r.json).toHaveBeenCalledWith({
      token: 'jwt',
      refreshToken: 'rt',
      user: { id: 'u1', email: 'meera@example.com', role: 'user', status: 'approved', firstName: 'Meera' },
    });
  });

  it('gives the web no refresh token', async () => {
    googleSays({ aud: 'web-client-id', email: 'meera@example.com', email_verified: true, sub: 'g1' });
    mocks.findFirst.mockResolvedValue(approved({ googleId: 'g1' }));
    const r = res();
    await googleAuth({ body } as Request, r);
    expect(r.json.mock.calls[0][0]).toEqual({ token: 'jwt', user: expect.any(Object) });
  });

  it('rejects a token for a client id that is not ours', async () => {
    googleSays({ aud: 'someone-elses-id', email: 'meera@example.com', email_verified: 'true', sub: 'g1' });
    await expect(googleAuth({ body } as Request, res())).rejects.toMatchObject({ status: 401, message: 'Google token mismatch' });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('puts an unknown email on the waitlist', async () => {
    googleSays({ aud: 'android-client-id', email: 'new@example.com', email_verified: 'true', sub: 'g9' });
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue(approved({ id: 'u9', email: 'new@example.com', googleId: 'g9', status: 'waitlist' }));
    const r = res();
    await googleAuth({ body } as Request, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ waitlisted: true }));
    expect(mocks.issueTokens).not.toHaveBeenCalled();
  });
});

describe('POST /auth/apple', () => {
  const body = { identityToken: 'x'.repeat(40) };

  it('signs in a member matched by Apple id', async () => {
    mocks.verifyApple.mockResolvedValue({ sub: 'apple-1', email: 'meera@example.com', emailVerified: true, isPrivateEmail: false });
    mocks.findFirst.mockResolvedValue(approved({ appleSub: 'apple-1' }));
    const r = res();
    await appleAuth({ body: { ...body, client: 'mobile' } } as Request, r);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { OR: [{ appleSub: 'apple-1' }, { email: 'meera@example.com' }] } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'jwt', refreshToken: 'rt' }));
  });

  it('links an existing account by email and keeps the first-time name', async () => {
    mocks.verifyApple.mockResolvedValue({ sub: 'apple-1', email: 'meera@example.com', emailVerified: true, isPrivateEmail: false });
    mocks.findFirst.mockResolvedValue(approved({ firstName: null }));
    mocks.update.mockResolvedValue(approved({ appleSub: 'apple-1', firstName: 'Meera', lastName: 'Rao' }));
    const r = res();
    await appleAuth({ body: { ...body, fullName: { givenName: ' Meera ', familyName: 'Rao' } } } as Request, r);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { appleSub: 'apple-1', emailVerified: true, firstName: 'Meera', lastName: 'Rao' },
    });
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ firstName: 'Meera' }) }));
  });

  it('puts an unknown Apple user on the waitlist, like Google', async () => {
    mocks.verifyApple.mockResolvedValue({ sub: 'apple-7', email: 'new@privaterelay.appleid.com', emailVerified: true, isPrivateEmail: true });
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue(approved({ id: 'u7', appleSub: 'apple-7', status: 'waitlist' }));
    const r = res();
    await appleAuth({ body } as Request, r);
    expect(mocks.create).toHaveBeenCalledWith({
      data: { email: 'new@privaterelay.appleid.com', appleSub: 'apple-7', firstName: null, lastName: null, status: 'waitlist', emailVerified: true },
    });
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ waitlisted: true }));
  });

  it('refuses a new account without a verified email', async () => {
    mocks.verifyApple.mockResolvedValue({ sub: 'apple-8', email: null, emailVerified: false, isPrivateEmail: false });
    mocks.findFirst.mockResolvedValue(null);
    await expect(appleAuth({ body } as Request, res())).rejects.toMatchObject({ status: 401 });
  });

  it('keeps the suspended out', async () => {
    mocks.verifyApple.mockResolvedValue({ sub: 'apple-1', email: 'meera@example.com', emailVerified: true, isPrivateEmail: false });
    mocks.findFirst.mockResolvedValue(approved({ appleSub: 'apple-1', status: 'suspended' }));
    await expect(appleAuth({ body } as Request, res())).rejects.toMatchObject({ status: 403 });
  });
});
