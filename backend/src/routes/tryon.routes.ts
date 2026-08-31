import { Router } from 'express';
import { createTryOn, deleteTryOn, listTryOns } from '../controllers/tryon.controller';
import { requireAuth } from '../middleware/auth';

export const tryOnRouter = Router();

tryOnRouter.post('/looks/:id/tryon', requireAuth, createTryOn);
tryOnRouter.get('/tryons', requireAuth, listTryOns);
tryOnRouter.delete('/tryons/:id', requireAuth, deleteTryOn);
