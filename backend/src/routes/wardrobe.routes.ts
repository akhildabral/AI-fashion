import { Router } from 'express';
import {
  addItem,
  deleteItem,
  itemFeedback,
  listItems,
  mixAndMatch,
  packForTrip,
  recatalogItem,
  setVisibility,
  resaleDraft,
  updateItem,
  whatToWearToday,
} from '../controllers/wardrobe.controller';
import { createOutfitTryOn } from '../controllers/tryon.controller';
import { requireAuth } from '../middleware/auth';
import { quota } from '../middleware/quota';
import { handleItemUpload } from '../middleware/upload';

export const wardrobeRouter = Router();

wardrobeRouter.get('/', requireAuth, listItems);
wardrobeRouter.post('/', requireAuth, quota('catalog'), handleItemUpload, addItem);
wardrobeRouter.post('/outfit', requireAuth, mixAndMatch);
wardrobeRouter.post('/today', requireAuth, whatToWearToday);
wardrobeRouter.post('/pack', requireAuth, packForTrip);
wardrobeRouter.post('/visibility', requireAuth, setVisibility);
wardrobeRouter.post('/:id/feedback', requireAuth, itemFeedback);
wardrobeRouter.post('/:id/resale-draft', requireAuth, resaleDraft);
wardrobeRouter.post('/tryon', requireAuth, quota('tryon'), createOutfitTryOn);
wardrobeRouter.post('/:id/recatalog', requireAuth, quota('catalog'), recatalogItem);
wardrobeRouter.patch('/:id', requireAuth, updateItem);
wardrobeRouter.delete('/:id', requireAuth, deleteItem);
