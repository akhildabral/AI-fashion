import { Router } from 'express';
import {
  addItem,
  deleteItem,
  listItems,
  mixAndMatch,
  updateItem,
  whatToWearToday,
} from '../controllers/wardrobe.controller';
import { requireAuth } from '../middleware/auth';
import { handleItemUpload } from '../middleware/upload';

export const wardrobeRouter = Router();

wardrobeRouter.get('/', requireAuth, listItems);
wardrobeRouter.post('/', requireAuth, handleItemUpload, addItem);
wardrobeRouter.post('/outfit', requireAuth, mixAndMatch);
wardrobeRouter.post('/today', requireAuth, whatToWearToday);
wardrobeRouter.patch('/:id', requireAuth, updateItem);
wardrobeRouter.delete('/:id', requireAuth, deleteItem);
