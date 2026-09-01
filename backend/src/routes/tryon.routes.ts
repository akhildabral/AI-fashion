import { Router } from 'express';
import { createTryOn, deleteTryOn, listTryOns } from '../controllers/tryon.controller';
import { requireAuth } from '../middleware/auth';
import { quota } from '../middleware/quota';

export const tryOnRouter = Router();

tryOnRouter.post('/looks/:id/tryon', requireAuth, quota('tryon'), createTryOn);
tryOnRouter.get('/tryons', requireAuth, listTryOns);
tryOnRouter.delete('/tryons/:id', requireAuth, deleteTryOn);
