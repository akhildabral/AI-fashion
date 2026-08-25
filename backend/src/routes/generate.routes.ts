import { Router } from 'express';
import { generate, listLooks } from '../controllers/generate.controller';
import { requireAuth } from '../middleware/auth';

export const looksRouter = Router();

looksRouter.post('/generate', requireAuth, generate);
looksRouter.get('/looks', requireAuth, listLooks);
