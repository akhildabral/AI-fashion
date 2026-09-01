import { Router } from 'express';
import { approveUser, listUsers, suspendUser } from '../controllers/admin.controller';
import { requireAdmin, requireAuth } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
adminRouter.get('/admin/users', listUsers);
adminRouter.post('/admin/users/:id/approve', approveUser);
adminRouter.post('/admin/users/:id/suspend', suspendUser);
