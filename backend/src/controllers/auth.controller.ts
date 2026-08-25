import type { Request, Response } from 'express';
import { z } from 'zod';
import { loginUser, registerUser } from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function register(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const { user, token } = await registerUser(email, password);
  res.status(201).json({ token, user });
}

export async function login(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const { user, token } = await loginUser(email, password);
  res.status(200).json({ token, user });
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new HttpError(401, 'Not authenticated');
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  res.json({ user });
}
