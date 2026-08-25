import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

export interface PublicUser {
  id: string;
  email: string;
}

function signToken(user: PublicUser): string {
  return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export async function registerUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser; token: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash },
    select: { id: true, email: true },
  });

  return { user: created, token: signToken(created) };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser; token: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const publicUser: PublicUser = { id: user.id, email: user.email };
  return { user: publicUser, token: signToken(publicUser) };
}
