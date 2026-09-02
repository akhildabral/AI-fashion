import { Router } from 'express';
import {
  styleTwins,
  wardrobeOverlap,
  createPick,
  deletePick,
  dressSuggest,
  thankPick,
  withdrawPick,
  followUser,
  getProfileByHandle,
  listPicks,
  network,
  searchUsers,
  setHandle,
  socialMe,
  unfollowUser,
} from '../controllers/social.controller';
import { blockUser, createReport, listHidden, muteUser, removeFollower, unblockUser, unmuteUser } from '../controllers/safety.controller';
import { myInvite } from '../controllers/invite.controller';
import { requireAuth } from '../middleware/auth';
import { handleAvailable, weatherFor } from '../controllers/fitting.controller';

export const socialRouter = Router();

socialRouter.put('/social/handle', requireAuth, setHandle);
socialRouter.get('/social/me', requireAuth, socialMe);
socialRouter.get('/social/handle/available', requireAuth, handleAvailable);
socialRouter.get('/weather', requireAuth, weatherFor);
socialRouter.get('/social/network', requireAuth, network);
socialRouter.get('/social/hidden', requireAuth, listHidden);
socialRouter.get('/social/twins', requireAuth, styleTwins);
socialRouter.get('/invites/mine', requireAuth, myInvite);
socialRouter.get('/users/search', requireAuth, searchUsers);
socialRouter.get('/users/:handle', requireAuth, getProfileByHandle);
socialRouter.get('/users/:handle/overlap', requireAuth, wardrobeOverlap);
socialRouter.post('/users/:handle/follow', requireAuth, followUser);
socialRouter.delete('/users/:handle/follow', requireAuth, unfollowUser);
socialRouter.delete('/users/:handle/follower', requireAuth, removeFollower);
socialRouter.post('/users/:handle/block', requireAuth, blockUser);
socialRouter.delete('/users/:handle/block', requireAuth, unblockUser);
socialRouter.post('/users/:handle/mute', requireAuth, muteUser);
socialRouter.delete('/users/:handle/mute', requireAuth, unmuteUser);
socialRouter.get('/users/:handle/dress', requireAuth, dressSuggest);
socialRouter.post('/users/:handle/picks', requireAuth, createPick);
socialRouter.post('/picks/:id/thanks', requireAuth, thankPick);
socialRouter.post('/picks/:id/withdraw', requireAuth, withdrawPick);
socialRouter.get('/picks', requireAuth, listPicks);
socialRouter.delete('/picks/:id', requireAuth, deletePick);
socialRouter.post('/reports', requireAuth, createReport);
