import { Router } from 'express';
import {
  briefAlternatives,
  getBrief,
  shareBriefWear,
  swapBriefItem,
  wearBrief,
} from '../controllers/brief.controller';
import { ritualStats } from '../controllers/ritual.controller';
import { getFeed } from '../controllers/feed.controller';
import { requireAuth } from '../middleware/auth';

export const briefRouter = Router();

briefRouter.get('/brief', requireAuth, getBrief);
briefRouter.post('/brief/wear', requireAuth, wearBrief);
briefRouter.post('/brief/share', requireAuth, shareBriefWear);
briefRouter.post('/brief/swap', requireAuth, swapBriefItem);
briefRouter.get('/brief/alternatives', requireAuth, briefAlternatives);
briefRouter.get('/stats/ritual', requireAuth, ritualStats);
briefRouter.get('/feed', requireAuth, getFeed);
