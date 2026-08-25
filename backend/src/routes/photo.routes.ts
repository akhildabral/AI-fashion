import { Router } from 'express';
import { deletePhoto, getPhoto, uploadPhoto } from '../controllers/photo.controller';
import { requireAuth } from '../middleware/auth';
import { handlePhotoUpload } from '../middleware/upload';

export const photoRouter = Router();

photoRouter.get('/', requireAuth, getPhoto);
photoRouter.post('/', requireAuth, handlePhotoUpload, uploadPhoto);
photoRouter.delete('/', requireAuth, deletePhoto);
