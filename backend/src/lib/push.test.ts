import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  expoSend: vi.fn(),
  expoReceipts: vi.fn(),
  webSend: vi.fn(),
  del: vi.fn(),
  delMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('../config/env', () => ({
  env: { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:hello@myzauq.com' },
}));
vi.mock('./prisma', () => ({
  prisma: { pushSubscription: { delete: mocks.del, deleteMany: mocks.delMany, findMany: mocks.findMany } },
}));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: mocks.webSend } }));
vi.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken(t: unknown) {
      return typeof t === 'string' && t.startsWith('ExponentPushToken[');
    }
    chunkPushNotifications<T>(m: T[]) {
      return [m];
    }
    chunkPushNotificationReceiptIds<T>(ids: T[]) {
      return [ids];
    }
    sendPushNotificationsAsync = mocks.expoSend;
    getPushNotificationReceiptsAsync = mocks.expoReceipts;
  }
  return { Expo };
});

import { checkExpoReceipts, deadTokensFromTickets, expoEndpoint, sendNativeEvent, sendPush, toExpoMessage } from './push';

const web = { id: 'w1', platform: 'web', endpoint: 'https://push.example/abc', p256dh: 'k', auth: 'a' };
const phone = { id: 'p1', platform: 'ios', endpoint: expoEndpoint('ExponentPushToken[abc]'), expoToken: 'ExponentPushToken[abc]' };
const payload = { title: 'Your reflection is ready', body: 'Tap to look.', url: '/mirror?render=1', route: '/mirror/render/1', tag: 'render-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.del.mockResolvedValue(undefined);
  mocks.delMany.mockResolvedValue({ count: 1 });
});

describe('sendPush', () => {
  it('sends a web row through web-push with the full payload as JSON', async () => {
    mocks.webSend.mockResolvedValue(undefined);
    expect(await sendPush(web, payload)).toBe(true);
    expect(mocks.webSend).toHaveBeenCalledOnce();
    const [sub, body] = mocks.webSend.mock.calls[0];
    expect(sub).toEqual({ endpoint: web.endpoint, keys: { p256dh: 'k', auth: 'a' } });
    expect(JSON.parse(body)).toEqual(payload);
    expect(mocks.expoSend).not.toHaveBeenCalled();
  });

  it('drops a web row the push service says is gone', async () => {
    mocks.webSend.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    expect(await sendPush(web, payload)).toBe(false);
    expect(mocks.del).toHaveBeenCalledWith({ where: { id: 'w1' } });
  });

  it('sends a native row through Expo with the route in data', async () => {
    mocks.expoSend.mockResolvedValue([{ status: 'ok', id: 'receipt-1' }]);
    expect(await sendPush(phone, payload)).toBe(true);
    expect(mocks.webSend).not.toHaveBeenCalled();
    const [messages] = mocks.expoSend.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      to: 'ExponentPushToken[abc]',
      title: payload.title,
      body: payload.body,
      channelId: 'events',
      data: { route: '/mirror/render/1', url: '/mirror?render=1', tag: 'render-1' },
    });
  });

  it('prunes a native row whose ticket says DeviceNotRegistered', async () => {
    mocks.expoSend.mockResolvedValue([
      { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered', expoPushToken: 'ExponentPushToken[abc]' } },
    ]);
    expect(await sendPush(phone, payload)).toBe(false);
    expect(mocks.delMany).toHaveBeenCalledWith({ where: { expoToken: 'ExponentPushToken[abc]' } });
  });

  it('keeps a native row on any other ticket error', async () => {
    mocks.expoSend.mockResolvedValue([{ status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } }]);
    expect(await sendPush(phone, payload)).toBe(false);
    expect(mocks.delMany).not.toHaveBeenCalled();
  });
});

describe('receipts', () => {
  it('prunes tokens whose receipt says DeviceNotRegistered', async () => {
    mocks.expoReceipts.mockResolvedValue({
      r1: { status: 'ok' },
      r2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered', expoPushToken: 'ExponentPushToken[gone]' } },
    });
    expect(await checkExpoReceipts(['r1', 'r2'])).toEqual(['ExponentPushToken[gone]']);
    expect(mocks.delMany).toHaveBeenCalledWith({ where: { expoToken: 'ExponentPushToken[gone]' } });
  });

  it('falls back to the message the ticket answered when it names no token', () => {
    const messages = [toExpoMessage('ExponentPushToken[one]', payload), toExpoMessage('ExponentPushToken[two]', payload)];
    const tickets = [
      { status: 'ok' as const, id: 'r' },
      { status: 'error' as const, message: 'x', details: { error: 'DeviceNotRegistered' as const } },
    ];
    expect(deadTokensFromTickets(messages, tickets)).toEqual(['ExponentPushToken[two]']);
  });
});

describe('toExpoMessage', () => {
  it('puts the ritual on its own channel and defaults the route to today', () => {
    const m = toExpoMessage('ExponentPushToken[x]', { title: 'Good morning.', body: 'Your look is ready.', url: '/', tag: 'ritual-2026-09-03' });
    expect(m.channelId).toBe('ritual');
    expect(m.data).toEqual({ route: '/today', url: '/', tag: 'ritual-2026-09-03' });
  });
});

describe('sendNativeEvent', () => {
  it('only asks for native rows that opted into the kind', async () => {
    mocks.findMany.mockResolvedValue([phone]);
    mocks.expoSend.mockResolvedValue([{ status: 'ok', id: 'r' }]);
    expect(await sendNativeEvent('u1', 'renders', payload)).toBe(1);
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', platform: { not: 'web' }, eventsRenders: true }, take: 10 });
    expect(await sendNativeEvent('u1', 'circle', payload)).toBe(1);
    expect(mocks.findMany).toHaveBeenLastCalledWith({ where: { userId: 'u1', platform: { not: 'web' }, eventsCircle: true }, take: 10 });
  });

  it('is quiet when there is no phone', async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await sendNativeEvent('u1', 'circle', payload)).toBe(0);
    expect(mocks.expoSend).not.toHaveBeenCalled();
  });
});
