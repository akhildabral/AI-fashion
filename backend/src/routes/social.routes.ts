import { Router } from 'express';
import {
  styleTwins,
  wardrobeOverlap,
  createPick,
  deletePick,
  followUser,
  getProfileByHandle,
  listPicks,
  network,
  searchUsers,
  setHandle,
  socialMe,
  unfollowUser,
} from '../controllers/social.controller';
import { requireAuth } from '../middleware/auth';
import { handleAvailable, weatherFor } from '../controllers/fitting.controller';

export const socialRouter = Router();

socialRouter.put('/social/handle', requireAuth, setHandle);
socialRouter.get('/social/me', requireAuth, socialMe);
socialRouter.get('/social/handle/available', requireAuth, handleAvailable);
socialRouter.get('/weather', requireAuth, weatherFor);
socialRouter.get('/social/network', requireAuth, network);
socialRouter.get('/users/search', requireAuth, searchUsers);
socialRouter.get('/social/twins', requireAuth, styleTwins);
socialRouter.get('/users/:handle', requireAuth, getProfileByHandle);
socialRouter.get('/users/:handle/overlap', requireAuth, wardrobeOverlap);
socialRouter.post('/users/:handle/follow', requireAuth, followUser);
socialRouter.delete('/users/:handle/follow', requireAuth, unfollowUser);
socialRouter.post('/users/:handle/picks', requireAuth, createPick);
socialRouter.get('/picks', requireAuth, listPicks);
socialRouter.delete('/picks/:id', requireAuth, deletePick);
