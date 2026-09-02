import { Router } from 'express';
import {
  approveAndInvite,
  inviteByEmail,
  approveUser,
  createUser,
  listUsers,
  markVerified,
  setPlan,
  resetPassword,
  suspendUser,
  rematteCutouts,
} from '../controllers/admin.controller';
import { listReports, resolveReport, setInvites } from '../controllers/safety.controller';
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
adminRouter.post('/admin/users/:id/plan', setPlan);
adminRouter.post('/admin/users/:id/invite', approveAndInvite);
adminRouter.post('/admin/invite', inviteByEmail);
adminRouter.post('/admin/users/:id/invites', setInvites);
adminRouter.get('/admin/reports', listReports);
adminRouter.post('/admin/reports/:id/resolve', resolveReport);
adminRouter.post('/admin/maintenance/rematte', rematteCutouts);
