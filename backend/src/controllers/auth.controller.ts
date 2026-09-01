import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  loginUser,
  registerUser,
  resendVerification,
  verifyEmail,
} from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Where verification links should point — the public web origin, derived from
// forwarded headers so it works behind the proxy and in dev.
function publicOrigin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
  return `${proto}://${req.get('host')}`;
}

export async function register(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const result = await registerUser(email, password, publicOrigin(req));
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const { user, token } = await loginUser(email, password);
  res.status(200).json({ token, user });
}

const verifySchema = z.object({ token: z.string().min(16).max(128) });

export async function verify(req: Request, res: Response) {
  const { token } = verifySchema.parse({ token: req.query.token });
  const user = await verifyEmail(String(token));
  res.json({
    user,
    message:
      user.status === 'approved'
        ? 'Email verified — you can log in now.'
        : "Email verified! You're on the waitlist — we'll let you know once access is approved.",
  });
}

const resendSchema = z.object({ email: z.string().email() });

export async function resend(req: Request, res: Response) {
  const { email } = resendSchema.parse(req.body);
  await resendVerification(email, publicOrigin(req));
  // Uniform response — never reveals whether the account exists.
  res.json({ message: 'If that account needs verification, a fresh link is on its way.' });
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new HttpError(401, 'Not authenticated');
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, role: true, status: true, handle: true },
  });
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  res.json({ user });
}
