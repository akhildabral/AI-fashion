import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ jwtVerify: vi.fn(), createRemoteJWKSet: vi.fn(() => 'jwks') }));

vi.mock('../config/env', () => ({ env: { APPLE_BUNDLE_IDS: ['com.myzauq.app', 'com.myzauq.app.dev'] } }));
vi.mock('jose', () => ({ jwtVerify: mocks.jwtVerify, createRemoteJWKSet: mocks.createRemoteJWKSet }));

import { verifyAppleIdentityToken } from './apple';

beforeEach(() => vi.clearAllMocks());

describe('verifyAppleIdentityToken', () => {
  it('verifies against Apple keys, issuer and our bundle ids', async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: { sub: 'apple-1', email: ' Meera@PrivateRelay.AppleID.com ', email_verified: 'true', is_private_email: 'true' } });
    const id = await verifyAppleIdentityToken('a.b.c');
    expect(id).toEqual({ sub: 'apple-1', email: 'meera@privaterelay.appleid.com', emailVerified: true, isPrivateEmail: true });
    expect(mocks.createRemoteJWKSet).toHaveBeenCalledWith(new URL('https://appleid.apple.com/auth/keys'));
    expect(mocks.jwtVerify).toHaveBeenCalledWith('a.b.c', 'jwks', {
      issuer: 'https://appleid.apple.com',
      audience: ['com.myzauq.app', 'com.myzauq.app.dev'],
      algorithms: ['RS256'],
    });
  });

  it('reads boolean flags too', async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: { sub: 'apple-2', email: 'a@b.com', email_verified: true } });
    expect(await verifyAppleIdentityToken('t')).toMatchObject({ emailVerified: true, isPrivateEmail: false });
  });

  it('turns any verification failure into a 401', async () => {
    mocks.jwtVerify.mockRejectedValue(new Error('unexpected "aud" claim value'));
    await expect(verifyAppleIdentityToken('bad')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token without a subject', async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: { email: 'a@b.com' } });
    await expect(verifyAppleIdentityToken('t')).rejects.toMatchObject({ status: 401 });
  });

  it('reuses one key set across calls', async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: { sub: 's' } });
    await verifyAppleIdentityToken('t1');
    await verifyAppleIdentityToken('t2');
    // Made once for the module's life (possibly by an earlier test), never per call.
    expect(mocks.createRemoteJWKSet.mock.calls.length).toBeLessThanOrEqual(1);
    expect(mocks.jwtVerify).toHaveBeenCalledTimes(2);
  });
});
