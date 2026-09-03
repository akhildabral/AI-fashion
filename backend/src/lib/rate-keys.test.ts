import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { emailKey, ipKey, userOrIpKey } from './rate-keys';

const SECRET = 'rate-key-test-secret-0123456789';
const req = (over: Partial<Request> & { headers?: Record<string, string> } = {}): Request =>
  ({ headers: {}, ip: '203.0.113.9', body: {}, ...over }) as unknown as Request;

describe('userOrIpKey', () => {
  const key = userOrIpKey(SECRET);

  it('keys a genuine bearer token by its user', () => {
    const token = jwt.sign({ sub: 'u1', tv: 0 }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    expect(key(req({ headers: { authorization: `Bearer ${token}` } }))).toBe('user:u1');
  });

  it('falls back to the address for a forged, expired or missing token', () => {
    const forged = jwt.sign({ sub: 'u1' }, 'not-the-secret-not-the-secret', { algorithm: 'HS256' });
    expect(key(req({ headers: { authorization: `Bearer ${forged}` } }))).toBe('203.0.113.9');
    const expired = jwt.sign({ sub: 'u1' }, SECRET, { algorithm: 'HS256', expiresIn: -10 });
    expect(key(req({ headers: { authorization: `Bearer ${expired}` } }))).toBe('203.0.113.9');
    expect(key(req())).toBe('203.0.113.9');
    expect(key(req({ headers: { authorization: 'Basic abc' } }))).toBe('203.0.113.9');
  });

  it('collapses IPv6 addresses to their block', () => {
    const a = ipKey(req({ ip: '2001:db8:abcd:1200:1111::1' }));
    const b = ipKey(req({ ip: '2001:db8:abcd:1233:2222::9' }));
    expect(a).toBe(b);
    expect(a).not.toBe('2001:db8:abcd:1200:1111::1');
    expect(ipKey(req({ ip: '2001:db8:abce:1200::1' }))).not.toBe(a);
  });
});

describe('emailKey', () => {
  it('keys by the normalised email in the body', () => {
    expect(emailKey(req({ body: { email: '  Meera@Example.com ' } }))).toBe('email:meera@example.com');
  });

  it('falls back to the address without one', () => {
    expect(emailKey(req({ body: {} }))).toBe('203.0.113.9');
    expect(emailKey(req({ body: { email: 42 } }))).toBe('203.0.113.9');
  });
});
