import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { ipKeyGenerator } from 'express-rate-limit';

// Rate-limit keys. Signed-in traffic is counted per account, so a household
// or an office behind one address never shares a ceiling; everything else is
// counted per address (IPv6 collapsed to its /56 by the library's helper, so
// one person's rotating addresses count as one).

/** The address key, IPv6-aware. */
export function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

/**
 * The user id from a bearer token when the token is genuine, else the
 * address. Signature-checked but not looked up: the limiter runs before auth
 * and must stay free of DB work. A forged token cannot pick a key of its own.
 */
export function userOrIpKey(secret: string) {
  return (req: Request): string => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(header.slice('Bearer '.length), secret, { algorithms: ['HS256'] }) as { sub?: string };
        if (typeof payload.sub === 'string' && payload.sub) return `user:${payload.sub}`;
      } catch {
        // Not ours, or expired: count it against the address.
      }
    }
    return ipKey(req);
  };
}

/** The normalised email in the body, so one account's attempts are counted
 *  together whichever address they come from. Falls back to the address. */
export function emailKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email === 'string' && email.trim()) return `email:${email.trim().toLowerCase()}`;
  return ipKey(req);
}
