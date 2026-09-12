import { Router } from 'express';
import {
  addItem,
  deleteItem,
  getItem,
  itemFeedback,
  listItems,
  mixAndMatch,
  packForTrip,
  packLook,
  recatalogItem,
  resolveTwin,
  setVisibility,
  resaleDraft,
  updateItem,
  whatToWearToday,
} from '../controllers/wardrobe.controller';
import { createOutfitTryOn } from '../controllers/tryon.controller';
import { requireAuth } from '../middleware/auth';
import { basketClean, getBasket } from '../controllers/basket.controller';
import { itemPairs, itemStory } from '../controllers/outfits.controller';
import { compareCandidates, itemVerdict } from '../controllers/store.controller';
import { fromLink, rereadLink } from '../controllers/link.controller';
import { quota } from '../middleware/quota';
import { handleItemUpload } from '../middleware/upload';

import { chooseGarment } from '../controllers/wardrobe.controller';
import { createCandidateTryOn } from '../controllers/tryon.controller';
import { itemOutbound } from '../controllers/store.controller';

export const wardrobeRouter = Router();

wardrobeRouter.get('/', requireAuth, listItems);
wardrobeRouter.get('/basket', requireAuth, getBasket);
wardrobeRouter.post('/basket/clean', requireAuth, basketClean);
// Compare two candidates; registered before '/:id' so "compare" is never an id.
wardrobeRouter.get('/compare', requireAuth, compareCandidates);
wardrobeRouter.post('/', requireAuth, handleItemUpload, quota('catalog'), addItem);
// The Fitting Room's link door: imports are unmetered, so no quota() here.
wardrobeRouter.post('/from-link', requireAuth, fromLink);
wardrobeRouter.post('/outfit', requireAuth, mixAndMatch);
wardrobeRouter.post('/today', requireAuth, whatToWearToday);
wardrobeRouter.post('/pack', requireAuth, packForTrip);
wardrobeRouter.post('/pack/look', requireAuth, packLook);
wardrobeRouter.post('/visibility', requireAuth, setVisibility);
wardrobeRouter.post('/:id/feedback', requireAuth, itemFeedback);
wardrobeRouter.post('/:id/resale-draft', requireAuth, resaleDraft);
wardrobeRouter.post('/tryon', requireAuth, quota('tryon'), createOutfitTryOn);
wardrobeRouter.post('/:id/recatalog', requireAuth, quota('catalog'), recatalogItem);
wardrobeRouter.post('/:id/twin', requireAuth, resolveTwin);
wardrobeRouter.post('/:id/reread', requireAuth, rereadLink);
wardrobeRouter.get('/:id', requireAuth, getItem);
wardrobeRouter.get('/:id/pairs', requireAuth, itemPairs);
wardrobeRouter.get('/:id/story', requireAuth, itemStory);
wardrobeRouter.get('/:id/verdict', requireAuth, itemVerdict);
wardrobeRouter.patch('/:id', requireAuth, updateItem);
wardrobeRouter.delete('/:id', requireAuth, deleteItem);
// The Fitting Room: a candidate on the reflection (render meter), "that one"
// from a rail photo, and the shop link, affiliate-wrapped when configured.
wardrobeRouter.post('/:id/tryon', requireAuth, quota('tryon'), createCandidateTryOn);
wardrobeRouter.post('/:id/choose-garment', requireAuth, quota('catalog'), chooseGarment);
wardrobeRouter.get('/:id/outbound', requireAuth, itemOutbound);
