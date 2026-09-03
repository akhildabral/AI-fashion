import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  loadMe: vi.fn(),
  getProfile: vi.fn(),
  briefFor: vi.fn(),
  pushStatusFor: vi.fn(),
  billingSummaryFor: vi.fn(),
  count: vi.fn(),
}));

vi.mock('../config/env', () => ({
  env: { MIN_SUPPORTED_CLIENT: '1.2.0', GOOGLE_CLIENT_IDS: ['web-id', 'ios-id'], APPLE_BUNDLE_IDS: ['com.myzauq.app'] },
}));
vi.mock('../lib/prisma', () => ({ prisma: { notification: { count: mocks.count } } }));
vi.mock('../services/profile.service', () => ({ getProfile: mocks.getProfile }));
vi.mock('./auth.controller', () => ({ loadMe: mocks.loadMe }));
vi.mock('./brief.controller', () => ({ briefFor: mocks.briefFor }));
vi.mock('./push.controller', () => ({ pushStatusFor: mocks.pushStatusFor }));
vi.mock('./billing.controller', () => ({ billingSummaryFor: mocks.billingSummaryFor }));

import { bootstrap } from './bootstrap.controller';

function res() {
  const r = { status: vi.fn(), json: vi.fn() };
  r.status.mockReturnValue(r);
  return r as unknown as Response & typeof r;
}
const authed = (query: Record<string, string> = {}) => ({ user: { id: 'u1', email: 'a@b.com', role: 'user', plan: 'free' }, query }) as unknown as Request;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.loadMe.mockResolvedValue({ id: 'u1', name: 'Meera' });
  mocks.getProfile.mockResolvedValue({ city: 'Mumbai' });
  mocks.briefFor.mockResolvedValue({ mode: 'brief', brief: { title: 'The work look' } });
  mocks.pushStatusFor.mockResolvedValue({ enabled: true, native: true, devices: 1 });
  mocks.billingSummaryFor.mockResolvedValue({ plan: 'free', planStatus: 'none' });
  mocks.count.mockResolvedValue(3);
});

describe('GET /bootstrap', () => {
  it('assembles every section in one body, with the client config', async () => {
    const r = res();
    await bootstrap(authed({ date: '2026-09-03' }), r);
    expect(mocks.briefFor).toHaveBeenCalledWith('u1', { date: '2026-09-03' });
    expect(mocks.count).toHaveBeenCalledWith({ where: { userId: 'u1', readAt: null } });
    expect(r.json).toHaveBeenCalledWith({
      user: { id: 'u1', name: 'Meera' },
      profile: { city: 'Mumbai' },
      brief: { mode: 'brief', brief: { title: 'The work look' } },
      unread: 3,
      push: { enabled: true, native: true, devices: 1 },
      plan: { plan: 'free', planStatus: 'none' },
      config: { minSupportedClient: '1.2.0', googleClientIds: ['web-id', 'ios-id'], appleBundleIds: ['com.myzauq.app'] },
    });
  });

  it('returns null for a section that fails and keeps the rest', async () => {
    mocks.briefFor.mockRejectedValue(new Error('weather is down'));
    mocks.billingSummaryFor.mockRejectedValue(new Error('gateway'));
    const r = res();
    await bootstrap(authed(), r);
    const body = r.json.mock.calls[0][0];
    expect(body.brief).toBeNull();
    expect(body.plan).toBeNull();
    expect(body.user).toEqual({ id: 'u1', name: 'Meera' });
    expect(body.unread).toBe(3);
    expect(body.push).toEqual({ enabled: true, native: true, devices: 1 });
    expect(r.status).not.toHaveBeenCalled();
  });

  it('defaults to today when the app sends no date', async () => {
    await bootstrap(authed(), res());
    expect(mocks.briefFor.mock.calls[0][1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects a malformed date', async () => {
    await expect(bootstrap(authed({ date: 'yesterday' }), res())).rejects.toBeTruthy();
  });

  it('refuses without a signed-in user', async () => {
    await expect(bootstrap({ query: {} } as Request, res())).rejects.toMatchObject({ status: 401 });
  });
});
