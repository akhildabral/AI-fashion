import { Router } from 'express';
import { previewLink } from '../controllers/link.controller';
import { requireAuth } from '../middleware/auth';

// GET /api/link/preview?url= — the paste field's card before the member commits.
export const linkRouter = Router();

linkRouter.get('/link/preview', requireAuth, previewLink);
