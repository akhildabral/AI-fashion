import { Router } from 'express';
import { getMyProfile, updateMyProfile } from '../controllers/profile.controller';
import { requireAuth } from '../middleware/auth';

export const profileRouter = Router();

profileRouter.get('/', requireAuth, getMyProfile);
profileRouter.put('/', requireAuth, updateMyProfile);
