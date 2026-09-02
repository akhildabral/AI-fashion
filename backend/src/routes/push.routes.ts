import { Router } from 'express';
import { pushKey, pushStatus, pushTest, subscribePush, unsubscribePush, updatePushSettings } from '../controllers/push.controller';
import { requireAuth } from '../middleware/auth';

export const pushRouter = Router();
pushRouter.get('/push/key', pushKey);
pushRouter.get('/push/status', requireAuth, pushStatus);
pushRouter.post('/push/subscribe', requireAuth, subscribePush);
pushRouter.patch('/push/settings', requireAuth, updatePushSettings);
pushRouter.post('/push/unsubscribe', requireAuth, unsubscribePush);
pushRouter.post('/push/test', requireAuth, pushTest);
