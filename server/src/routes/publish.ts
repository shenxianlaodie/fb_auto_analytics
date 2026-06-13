import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { PublishPayload, PublishService } from '../services/publishService';
import { sendFbError } from '../utils/fbError';
import { validatePublishPayload } from '../utils/adValidators';

export const publishRouter = Router();
publishRouter.use(authMiddleware);

// POST /api/publish — 向导一键发布完整链路
publishRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body as PublishPayload;
    const validationError = validatePublishPayload(payload);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const service = new PublishService(req.accessToken!);
    const result = await service.publish(payload);
    res.json(result);
  } catch (err: any) {
    sendFbError(res, err);
  }
});
