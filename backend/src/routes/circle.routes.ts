import { Router } from 'express';
import {
  addComment,
  circleExplore,
  circleFeed,
  circleSaved,
  circleToday,
  deleteComment,
  listComments,
  listNotifications,
  markNotificationsRead,
  myRecentLooks,
  reactToLook,
  saveLook,
  shareLook,
  unreactToLook,
  unreadCount,
  unsaveLook,
  unshareLook,
} from '../controllers/circle.controller';
import { requireAuth } from '../middleware/auth';

export const circleRouter = Router();

circleRouter.get('/circle/feed', requireAuth, circleFeed);
circleRouter.get('/circle/today', requireAuth, circleToday);
circleRouter.get('/circle/explore', requireAuth, circleExplore);
circleRouter.get('/circle/saved', requireAuth, circleSaved);
circleRouter.get('/circle/mine', requireAuth, myRecentLooks);

circleRouter.post('/looks/:id/react', requireAuth, reactToLook);
circleRouter.delete('/looks/:id/react', requireAuth, unreactToLook);
circleRouter.post('/looks/:id/save', requireAuth, saveLook);
circleRouter.delete('/looks/:id/save', requireAuth, unsaveLook);
circleRouter.post('/looks/:id/share', requireAuth, shareLook);
circleRouter.delete('/looks/:id/share', requireAuth, unshareLook);

circleRouter.get('/comments', requireAuth, listComments);
circleRouter.post('/comments', requireAuth, addComment);
circleRouter.delete('/comments/:id', requireAuth, deleteComment);

circleRouter.get('/notifications', requireAuth, listNotifications);
circleRouter.get('/notifications/unread', requireAuth, unreadCount);
circleRouter.post('/notifications/read', requireAuth, markNotificationsRead);
