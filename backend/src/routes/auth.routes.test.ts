import { describe, expect, it, vi } from 'vitest';

// The router pulls in every auth controller; none of their dependencies are
// exercised here, only the middleware wiring.
vi.mock('../config/env', () => ({ env: { JWT_SECRET: 'test-secret-that-is-long-enough-1234', JWT_EXPIRES_IN: '7d', ADMIN_EMAILS: [], GOOGLE_CLIENT_IDS: [], APPLE_BUNDLE_IDS: [] } }));
vi.mock('../lib/prisma', () => ({ prisma: {} }));
vi.mock('../lib/mailer', () => ({ sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock('../lib/storage', () => ({ deleteFile: vi.fn() }));
vi.mock('../lib/people', () => ({ displayName: () => '', ensureHandle: vi.fn() }));
vi.mock('../lib/notify', () => ({ notify: vi.fn() }));
vi.mock('../lib/apple', () => ({ verifyAppleIdentityToken: vi.fn() }));

import { AUTH_EMAIL_LIMIT, AUTH_IP_LIMIT, REFRESH_IP_LIMIT, authLimiter, authRouter, emailLimiter, refreshLimiter } from './auth.routes';

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } };
function handlersOf(method: string, path: string): unknown[] {
  const layer = (authRouter.stack as Layer[]).find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`no route ${method} ${path}`);
  return layer.route.stack.map((s) => s.handle);
}

describe('auth rate limiting', () => {
  it('keeps the per-email ceiling strict and lifts only the per-IP one', () => {
    expect(AUTH_EMAIL_LIMIT).toBe(20);
    expect(AUTH_IP_LIMIT).toBe(100);
    expect(REFRESH_IP_LIMIT).toBeGreaterThan(AUTH_IP_LIMIT);
  });

  it('keeps credential routes on both limiters', () => {
    const login = handlersOf('post', '/login');
    expect(login).toContain(authLimiter);
    expect(login).toContain(emailLimiter);
    expect(handlersOf('post', '/google')).toContain(authLimiter);
  });

  it('moves /refresh off the credential limiter onto its own', () => {
    const refresh = handlersOf('post', '/refresh');
    expect(refresh).toContain(refreshLimiter);
    expect(refresh).not.toContain(authLimiter);
    expect(refresh).not.toContain(emailLimiter);
  });

  it('leaves the public config route free of the credential limiter', () => {
    expect(handlersOf('get', '/config')).not.toContain(authLimiter);
  });
});
