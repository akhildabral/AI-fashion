import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';

// Sign in with Apple. The app hands us the identity token Apple gave it; we
// check its signature against Apple's published keys and that it was issued
// for one of our bundle ids. Apple only includes the person's name on their
// very first sign-in, and the email may be a private relay address.

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function keys() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  return jwks;
}

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdentity> {
  if (env.APPLE_BUNDLE_IDS.length === 0) throw new HttpError(503, 'Apple sign-in is not configured');
  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, keys(), {
      issuer: APPLE_ISSUER,
      audience: env.APPLE_BUNDLE_IDS,
      algorithms: ['RS256'],
    }));
  } catch {
    throw new HttpError(401, 'Apple sign-in failed — try again');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new HttpError(401, 'Apple token has no subject');
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  // Apple sends these as booleans or the strings "true"/"false".
  const flag = (v: unknown) => v === true || v === 'true';
  return {
    sub: payload.sub,
    email,
    emailVerified: Boolean(email) && flag(payload.email_verified),
    isPrivateEmail: flag(payload.is_private_email),
  };
}
