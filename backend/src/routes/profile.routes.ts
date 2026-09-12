import { Router } from 'express';
import { getFitBrands, getMyProfile, updateMyProfile } from '../controllers/profile.controller';
import { dismissFact, getTaste, recomputeTaste } from '../controllers/taste.controller';
import { requireAuth } from '../middleware/auth';

export const profileRouter = Router();

profileRouter.get('/', requireAuth, getMyProfile);
profileRouter.put('/', requireAuth, updateMyProfile);
// The same merge semantics under PATCH (measurements, the fitting's partial edits).
profileRouter.patch('/', requireAuth, updateMyProfile);
// The brand table behind "What fits you": brands, sizes and shoe scales per gender.
profileRouter.get('/fit-brands', requireAuth, getFitBrands);

// The taste layer: what the record says about how they dress. Writes sit
// under the /api write limiter like every other POST.
profileRouter.get('/taste', requireAuth, getTaste);
profileRouter.post('/taste/facts/:id/dismiss', requireAuth, dismissFact);
profileRouter.post('/taste/recompute', requireAuth, recomputeTaste);
