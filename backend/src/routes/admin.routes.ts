import { Router } from 'express';
import {
  approveUser,
  createUser,
  listUsers,
  markVerified,
  resetPassword,
  suspendUser,
} from '../controllers/admin.controller';
import { requireAdmin, requireAuth } from '../middleware/auth';

export const adminRouter = Router();

// Scope the guard to /admin — this router is mounted at /api alongside
// others, and a path-less use() would gate every route mounted after it.
adminRouter.use('/admin', requireAuth, requireAdmin);
adminRouter.get('/admin/users', listUsers);
adminRouter.post('/admin/users', createUser);
adminRouter.post('/admin/users/:id/approve', approveUser);
adminRouter.post('/admin/users/:id/suspend', suspendUser);
adminRouter.post('/admin/users/:id/verify', markVerified);
adminRouter.post('/admin/users/:id/reset-password', resetPassword);
