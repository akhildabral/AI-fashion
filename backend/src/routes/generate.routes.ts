import { Router } from 'express';
import {
  deleteLook,
  generate,
  listLooks,
  setFavorite,
} from '../controllers/generate.controller';
import { requireAuth } from '../middleware/auth';
import { quota } from '../middleware/quota';

export const looksRouter = Router();

looksRouter.post('/generate', requireAuth, quota('looks'), generate);
looksRouter.get('/looks', requireAuth, listLooks);
looksRouter.post('/looks/:id/favorite', requireAuth, setFavorite);
looksRouter.delete('/looks/:id', requireAuth, deleteLook);
