import { Router } from 'express';
import { getMyProfile, updateMyProfile } from '../controllers/profile.controller';
import { dismissFact, getTaste, recomputeTaste } from '../controllers/taste.controller';
import { requireAuth } from '../middleware/auth';

export const profileRouter = Router();

profileRouter.get('/', requireAuth, getMyProfile);
profileRouter.put('/', requireAuth, updateMyProfile);

// The taste layer: what the record says about how they dress. Writes sit
// under the /api write limiter like every other POST.
profileRouter.get('/taste', requireAuth, getTaste);
profileRouter.post('/taste/facts/:id/dismiss', requireAuth, dismissFact);
profileRouter.post('/taste/recompute', requireAuth, recomputeTaste);
