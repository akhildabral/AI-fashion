import { Router } from 'express';
import {
  addItem,
  deleteItem,
  itemFeedback,
  listItems,
  mixAndMatch,
  packForTrip,
  recatalogItem,
  resaleDraft,
  updateItem,
  whatToWearToday,
} from '../controllers/wardrobe.controller';
import { createOutfitTryOn } from '../controllers/tryon.controller';
import { requireAuth } from '../middleware/auth';
import { handleItemUpload } from '../middleware/upload';

export const wardrobeRouter = Router();

wardrobeRouter.get('/', requireAuth, listItems);
wardrobeRouter.post('/', requireAuth, handleItemUpload, addItem);
wardrobeRouter.post('/outfit', requireAuth, mixAndMatch);
wardrobeRouter.post('/today', requireAuth, whatToWearToday);
wardrobeRouter.post('/pack', requireAuth, packForTrip);
wardrobeRouter.post('/:id/feedback', requireAuth, itemFeedback);
wardrobeRouter.post('/:id/resale-draft', requireAuth, resaleDraft);
wardrobeRouter.post('/tryon', requireAuth, createOutfitTryOn);
wardrobeRouter.post('/:id/recatalog', requireAuth, recatalogItem);
wardrobeRouter.patch('/:id', requireAuth, updateItem);
wardrobeRouter.delete('/:id', requireAuth, deleteItem);
