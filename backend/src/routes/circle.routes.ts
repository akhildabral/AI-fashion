import { Router } from 'express';
import {
  circleExplore,
  circleFeed,
  circleToday,
  listNotifications,
  markNotificationsRead,
  reactToLook,
  unreactToLook,
  unreadCount,
} from '../controllers/circle.controller';
import { requireAuth } from '../middleware/auth';

export const circleRouter = Router();

circleRouter.get('/circle/feed', requireAuth, circleFeed);
circleRouter.get('/circle/today', requireAuth, circleToday);
circleRouter.get('/circle/explore', requireAuth, circleExplore);

circleRouter.post('/looks/:id/react', requireAuth, reactToLook);
circleRouter.delete('/looks/:id/react', requireAuth, unreactToLook);

circleRouter.get('/notifications', requireAuth, listNotifications);
circleRouter.get('/notifications/unread', requireAuth, unreadCount);
circleRouter.post('/notifications/read', requireAuth, markNotificationsRead);
