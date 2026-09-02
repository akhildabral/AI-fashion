import { Router } from 'express';
import { createTryOn, deleteTryOn, getTryOn, listTryOns, reportTryOn, retryTryOn } from '../controllers/tryon.controller';
import { requireAuth } from '../middleware/auth';
import { quota } from '../middleware/quota';

export const tryOnRouter = Router();

tryOnRouter.post('/looks/:id/tryon', requireAuth, quota('tryon'), createTryOn);
tryOnRouter.get('/tryons', requireAuth, listTryOns);
tryOnRouter.get('/tryons/:id', requireAuth, getTryOn);
tryOnRouter.post('/tryons/:id/retry', requireAuth, retryTryOn);
tryOnRouter.post('/tryons/:id/report', requireAuth, reportTryOn);
tryOnRouter.delete('/tryons/:id', requireAuth, deleteTryOn);
