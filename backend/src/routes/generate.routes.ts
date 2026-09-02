import { Router } from 'express';
import {
  deleteLook,
  generate,
  listLooks,
  recreateLook,
  setFavorite,
  setVerdict,
} from '../controllers/generate.controller';
import { requireAuth } from '../middleware/auth';
import { quota } from '../middleware/quota';

export const looksRouter = Router();

looksRouter.post('/generate', requireAuth, quota('looks'), generate);
looksRouter.get('/looks', requireAuth, listLooks);
looksRouter.post('/looks/:id/favorite', requireAuth, setFavorite);
looksRouter.delete('/looks/:id', requireAuth, deleteLook);
// Inspiration: keep it or throw it back; how much of it do I already own?
looksRouter.post('/looks/:id/verdict', requireAuth, setVerdict);
looksRouter.post('/looks/:id/recreate', requireAuth, recreateLook);
