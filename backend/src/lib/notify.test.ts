import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendNativeEvent: vi.fn(),
  notificationCreate: vi.fn(),
  notificationFindFirst: vi.fn(),
  blockFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('./prisma', () => ({
  prisma: {
    notification: { create: mocks.notificationCreate, findFirst: mocks.notificationFindFirst },
    block: { findFirst: mocks.blockFindFirst },
    user: { findUnique: mocks.userFindUnique },
  },
}));
vi.mock('./push', () => ({ sendNativeEvent: mocks.sendNativeEvent }));

import { mentionedHandles, notify, pushCopyFor } from './notify';

describe('mentionedHandles', () => {
  it('finds handles, lowercases and dedupes them in order', () => {
    expect(mentionedHandles('Love this @Meera — @riya what do you think? cc @meera')).toEqual(['meera', 'riya']);
  });
  it('ignores emails and too-short handles', () => {
    expect(mentionedHandles('mail me at a@b.com, hi @ab, and @ok_one')).toEqual(['ok_one']);
  });
  it('returns nothing for plain text', () => {
    expect(mentionedHandles('no mentions here')).toEqual([]);
  });
});

describe('pushCopyFor', () => {
  it('routes circle events to the post they are about', () => {
    const copy = pushCopyFor('commented', '@riya', { target: 'look', targetId: 'l1', commentId: 'c1', preview: 'Those shoes.' });
    expect(copy).toMatchObject({ title: '@riya left a note', body: 'Those shoes.', route: '/circle/post/look/l1', url: '/circle/post/look/l1' });
    expect(pushCopyFor('pick_received', 'Meera', { target: 'pick', targetId: 'p1' })?.route).toBe('/circle/post/pick/p1');
    expect(pushCopyFor('verdict_settled', null, { target: 'verdict', targetId: 'v1', question: 'Red or black?', totalVotes: 4, winner: 'a' })).toMatchObject({
      title: 'The verdict is in: Red or black?',
      route: '/circle/post/verdict/v1',
    });
  });

  it('sends a new follower to the bell', () => {
    expect(pushCopyFor('new_follower', '@riya')).toMatchObject({ title: '@riya is following you', route: '/circle/notifications' });
  });

  it('stays quiet for everything else', () => {
    expect(pushCopyFor('look_reacted', '@riya', { target: 'look', targetId: 'l1' })).toBeNull();
    expect(pushCopyFor('laundry_due', null)).toBeNull();
  });
});

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockFindFirst.mockResolvedValue(null);
    mocks.notificationCreate.mockResolvedValue({});
    mocks.userFindUnique.mockResolvedValue({ handle: 'riya', firstName: 'Riya', lastName: null });
    mocks.sendNativeEvent.mockResolvedValue(1);
  });

  it('buzzes the phone for a pushed type, after writing the bell entry', async () => {
    expect(await notify('u1', 'mentioned', 'u2', { target: 'look', targetId: 'l1', preview: 'hi' })).toBe(true);
    await vi.waitFor(() => expect(mocks.sendNativeEvent).toHaveBeenCalledOnce());
    expect(mocks.sendNativeEvent).toHaveBeenCalledWith('u1', 'circle', expect.objectContaining({ title: '@riya mentioned you', route: '/circle/post/look/l1' }));
  });

  it('does not buzz for a quiet type', async () => {
    expect(await notify('u1', 'look_reacted', 'u2', { target: 'look', targetId: 'l1' })).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendNativeEvent).not.toHaveBeenCalled();
  });

  it('never buzzes across a block', async () => {
    mocks.blockFindFirst.mockResolvedValue({ id: 'b' });
    expect(await notify('u1', 'commented', 'u2', { target: 'look', targetId: 'l1' })).toBe(false);
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.sendNativeEvent).not.toHaveBeenCalled();
  });
});
