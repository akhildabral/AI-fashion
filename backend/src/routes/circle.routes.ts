import { Router } from 'express';
import {
  addComment,
  circleExplore,
  circleFeed,
  circleSaved,
  clearLookPhoto,
  setLookPhoto,
  setLookPhotoFromRender,
  circleToday,
  deleteComment,
  listComments,
  listNotifications,
  markNotificationsRead,
  myRecentLooks,
  reactToLook,
  reactToPost,
  unreactToPost,
  getPost,
  saveLook,
  shareLook,
  unreactToLook,
  unreadCount,
  unsaveLook,
  unshareLook,
} from '../controllers/circle.controller';
import { requireAuth } from '../middleware/auth';
import { handlePhotoUpload } from '../middleware/upload';

export const circleRouter = Router();

circleRouter.get('/circle/feed', requireAuth, circleFeed);
circleRouter.get('/circle/post/:type/:id', requireAuth, getPost);
circleRouter.post('/posts/:type/:id/react', requireAuth, reactToPost);
circleRouter.delete('/posts/:type/:id/react', requireAuth, unreactToPost);
circleRouter.get('/circle/today', requireAuth, circleToday);
circleRouter.get('/circle/explore', requireAuth, circleExplore);
circleRouter.get('/circle/saved', requireAuth, circleSaved);
circleRouter.get('/circle/mine', requireAuth, myRecentLooks);

circleRouter.post('/looks/:id/react', requireAuth, reactToLook);
circleRouter.delete('/looks/:id/react', requireAuth, unreactToLook);
circleRouter.post('/looks/:id/save', requireAuth, saveLook);
circleRouter.delete('/looks/:id/save', requireAuth, unsaveLook);
circleRouter.post('/looks/:id/share', requireAuth, shareLook);
circleRouter.post('/looks/:id/photo', requireAuth, handlePhotoUpload, setLookPhoto);
circleRouter.post('/looks/:id/photo-from-render', requireAuth, setLookPhotoFromRender);
circleRouter.delete('/looks/:id/photo', requireAuth, clearLookPhoto);
circleRouter.delete('/looks/:id/share', requireAuth, unshareLook);

circleRouter.get('/comments', requireAuth, listComments);
circleRouter.post('/comments', requireAuth, addComment);
circleRouter.delete('/comments/:id', requireAuth, deleteComment);

circleRouter.get('/notifications', requireAuth, listNotifications);
circleRouter.get('/notifications/unread', requireAuth, unreadCount);
circleRouter.post('/notifications/read', requireAuth, markNotificationsRead);
