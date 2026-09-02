import { describe, expect, it } from 'vitest';
import { mentionedHandles } from './notify';

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
