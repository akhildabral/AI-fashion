import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';

// People are shown by name; the handle is the address (/u/:handle) and is
// given automatically, never asked for. One place decides both.

export const PERSON_SELECT = { id: true, handle: true, firstName: true, lastName: true, email: true } as const;

export type PersonRow = { handle: string | null; firstName?: string | null; lastName?: string | null; email?: string | null };

/** "Sam K." when there's a surname, "Sam" otherwise; the handle or the email's front as a last resort. */
export function displayName(u: PersonRow | null | undefined): string {
  if (!u) return 'Someone';
  const first = u.firstName?.trim();
  if (first) {
    const last = u.lastName?.trim();
    return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
  }
  if (u.handle) return u.handle;
  if (u.email) return u.email.split('@')[0];
  return 'Someone';
}

export function personOf(u: PersonRow | null | undefined): { handle: string | null; name: string } {
  return { handle: u?.handle ?? null, name: displayName(u) };
}

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function suffix(n = 3): string {
  const b = randomBytes(n);
  let s = '';
  for (const x of b) s += SUFFIX_ALPHABET[x % SUFFIX_ALPHABET.length];
  return s;
}

function baseFrom(u: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const raw = [u.firstName, u.lastName].filter(Boolean).join('_') || (u.email ?? '').split('@')[0] || 'member';
  let base = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  if (base.length < 3) base = (base + '_member').slice(0, 16);
  return base;
}

/**
 * Give a member a handle if they don't have one: their name, made into an
 * address, with a short suffix only if that address is taken.
 */
export async function ensureHandle(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: PERSON_SELECT });
  if (!u) throw new Error('No such user');
  if (u.handle) return u.handle;
  const base = baseFrom(u);
  const candidates = [base, ...Array.from({ length: 6 }, () => `${base.slice(0, 16)}_${suffix()}`)];
  for (const candidate of candidates) {
    if (!HANDLE_RE.test(candidate)) continue;
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { handle: candidate }, select: { handle: true, firstName: true, lastName: true } });
      return updated.handle as string;
    } catch {
      // taken — try the next
    }
  }
  const fallback = `member_${suffix(6)}`;
  const updated = await prisma.user.update({ where: { id: userId }, data: { handle: fallback }, select: { handle: true, firstName: true, lastName: true } });
  return updated.handle as string;
}
