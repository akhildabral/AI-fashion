import { Router } from 'express';
import {
  createOutfit,
  deleteWear,
  listOutfits,
  listWear,
  logWear,
  wearInsights,
} from '../controllers/wearlog.controller';
import { requireAuth } from '../middleware/auth';

export const wearLogRouter = Router();

wearLogRouter.post('/outfits', requireAuth, createOutfit);
wearLogRouter.get('/outfits', requireAuth, listOutfits);
wearLogRouter.post('/wearlog', requireAuth, logWear);
wearLogRouter.get('/wearlog', requireAuth, listWear);
wearLogRouter.get('/wearlog/insights', requireAuth, wearInsights);
wearLogRouter.delete('/wearlog/:id', requireAuth, deleteWear);
