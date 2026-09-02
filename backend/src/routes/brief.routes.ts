import { Router } from 'express';
import {
  briefAlternatives,
  composeEvening,
  getBrief,
  planDay,
  shareBriefWear,
  swapBriefItem,
  undoBrief,
  wearBrief,
  weatherCheck,
  weekBrief,
} from '../controllers/brief.controller';
import { closetGaps, ritualStats } from '../controllers/ritual.controller';
import { getFeed } from '../controllers/feed.controller';
import { recreateFromCloset } from '../controllers/recreate.controller';
import { createTrip, deleteTrip, getTrip, listTrips, swapTripItem, updateTrip } from '../controllers/trip.controller';
import {
  createLookbook,
  deleteLookbook,
  listLookbooks,
  toggleLookbookItem,
} from '../controllers/lookbook.controller';
import { getExplore, toggleFeature } from '../controllers/feed.controller';
import { requireAuth } from '../middleware/auth';

export const briefRouter = Router();

briefRouter.get('/brief', requireAuth, getBrief);
briefRouter.post('/brief/wear', requireAuth, wearBrief);
briefRouter.post('/brief/share', requireAuth, shareBriefWear);
briefRouter.post('/brief/swap', requireAuth, swapBriefItem);
briefRouter.get('/brief/alternatives', requireAuth, briefAlternatives);
briefRouter.get('/brief/week', requireAuth, weekBrief);
briefRouter.post('/brief/plan', requireAuth, planDay);
briefRouter.post('/brief/undo', requireAuth, undoBrief);
briefRouter.post('/brief/evening', requireAuth, composeEvening);
briefRouter.post('/brief/weather', requireAuth, weatherCheck);
briefRouter.get('/stats/ritual', requireAuth, ritualStats);
briefRouter.get('/stats/gaps', requireAuth, closetGaps);
briefRouter.get('/feed', requireAuth, getFeed);
briefRouter.post('/recreate', requireAuth, recreateFromCloset);
briefRouter.get('/trips', requireAuth, listTrips);
briefRouter.post('/trips', requireAuth, createTrip);
briefRouter.delete('/trips/:id', requireAuth, deleteTrip);
briefRouter.get('/trips/:id', requireAuth, getTrip);
briefRouter.patch('/trips/:id', requireAuth, updateTrip);
briefRouter.post('/trips/:id/swap', requireAuth, swapTripItem);
briefRouter.get('/lookbooks', requireAuth, listLookbooks);
briefRouter.post('/lookbooks', requireAuth, createLookbook);
briefRouter.post('/lookbooks/:id/toggle', requireAuth, toggleLookbookItem);
briefRouter.delete('/lookbooks/:id', requireAuth, deleteLookbook);
briefRouter.get('/explore', requireAuth, getExplore);
briefRouter.post('/explore/:id/feature', requireAuth, toggleFeature);
