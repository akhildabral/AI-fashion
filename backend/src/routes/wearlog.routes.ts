import { Router } from 'express';
import {
  createOutfit,
  deleteWear,
  listOutfits,
  listWear,
  logWear,
  rateWear,
  wearInsights,
} from '../controllers/wearlog.controller';
import { deleteOutfit, validateComposed } from '../controllers/outfits.controller';
import { requireAuth } from '../middleware/auth';
import { handlePhotoUpload } from '../middleware/upload';
import { quota } from '../middleware/quota';
import { confirmWearPhoto, getWearPhoto, readWearPhoto } from '../controllers/wear-photo.controller';

export const wearLogRouter = Router();

wearLogRouter.post('/outfits', requireAuth, createOutfit);
wearLogRouter.get('/outfits', requireAuth, listOutfits);
wearLogRouter.post('/outfits/validate', requireAuth, validateComposed);
wearLogRouter.delete('/outfits/:id', requireAuth, deleteOutfit);
wearLogRouter.post('/wearlog', requireAuth, logWear);
wearLogRouter.get('/wearlog', requireAuth, listWear);
wearLogRouter.get('/wearlog/insights', requireAuth, wearInsights);
wearLogRouter.delete('/wearlog/:id', requireAuth, deleteWear);
wearLogRouter.patch('/wearlog/:id/rating', requireAuth, rateWear);

// What you really wore: a photo of the day, read into pieces, confirmed row by row.
wearLogRouter.post('/wear/photo', requireAuth, handlePhotoUpload, quota('catalog'), readWearPhoto);
wearLogRouter.get('/wear/photo/:id', requireAuth, getWearPhoto);
wearLogRouter.post('/wear/photo/:id/confirm', requireAuth, confirmWearPhoto);
