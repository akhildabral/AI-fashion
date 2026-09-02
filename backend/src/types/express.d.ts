import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string; plan: string };
      /** Set by quota(): the usage event this request spent, so a failed render can give it back. */
      usageEventId?: string;
    }
  }
}

export {};
