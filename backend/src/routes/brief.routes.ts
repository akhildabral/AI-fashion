import { Router } from 'express';
import {
  briefAlternatives,
  composeEvening,
  composeLook,
  getBrief,
  planDay,
  removeLook,
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
import { addTripLook, createTrip, deleteTrip, getTrip, listTrips, removeTripLook, replanTripDay, setTripLookItems, swapTripItem, updateChecklist, updateTrip } from '../controllers/trip.controller';
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
briefRouter.post('/brief/look', requireAuth, composeLook);
briefRouter.delete('/brief/look', requireAuth, removeLook);
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
briefRouter.post('/trips/:id/days/:index/replan', requireAuth, replanTripDay);
briefRouter.post('/trips/:id/days/:index/looks', requireAuth, addTripLook);
briefRouter.delete('/trips/:id/days/:index/looks/:lookId', requireAuth, removeTripLook);
briefRouter.post('/trips/:id/days/:index/looks/:lookId/items', requireAuth, setTripLookItems);
briefRouter.post('/trips/:id/checklist', requireAuth, updateChecklist);
briefRouter.get('/lookbooks', requireAuth, listLookbooks);
briefRouter.post('/lookbooks', requireAuth, createLookbook);
briefRouter.post('/lookbooks/:id/toggle', requireAuth, toggleLookbookItem);
briefRouter.delete('/lookbooks/:id', requireAuth, deleteLookbook);
briefRouter.get('/explore', requireAuth, getExplore);
briefRouter.post('/explore/:id/feature', requireAuth, toggleFeature);
