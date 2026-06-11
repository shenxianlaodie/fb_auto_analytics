import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { PublishPayload, PublishService } from '../services/publishService';

export const publishRouter = Router();
publishRouter.use(authMiddleware);

// POST /api/publish — 向导一键发布完整链路
publishRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body as PublishPayload;
    if (!payload?.accountId || !payload?.campaign?.name || !payload?.adset?.name || !payload?.ad?.name) {
      res.status(400).json({ error: '发布数据不完整' });
      return;
    }
    const service = new PublishService(req.accessToken!);
    const result = await service.publish(payload);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
