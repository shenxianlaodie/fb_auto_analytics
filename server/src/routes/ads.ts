import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AdService } from '../services/adService';
import { writeBackAd } from '../models/fbStructure';
import { FacebookClient } from '../services/facebookClient';
import { fbErrorMessage } from '../utils/fbError';

export const adsRouter = Router();
adsRouter.use(authMiddleware);

adsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, adsetId, campaignId, limit, after } = req.query;
    const service = new AdService(req.accessToken!);
    const result = await service.getAds(
      accountId as string,
      { adsetId: adsetId as string, campaignId: campaignId as string },
      limit ? parseInt(limit as string) : 25,
      after as string
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new AdService(req.accessToken!);
    const result = await service.getAd(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, adsetId, name, creative, status, trackingSpecs } = req.body;
    const service = new AdService(req.accessToken!);
    const result = await service.createAd(accountId, {
      adsetId,
      name,
      creative,
      status: status || 'PAUSED',
      trackingSpecs,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, status } = req.body;
    const service = new AdService(req.accessToken!);
    const result = await service.updateAd(req.params.id, { name, status });
    // FB 更新成功后立即写回本地库，前端无需等下一轮同步
    await writeBackAd(req.params.id, { status });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new AdService(req.accessToken!);
    await service.deleteAd(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ads/:id/copy — 复制广告（可指定目标广告组）
adsRouter.post('/:id/copy', async (req: AuthRequest, res: Response) => {
  try {
    const { count = 1, statusOption = 'PAUSED', targetAdsetId } = req.body;
    const fb = FacebookClient.getInstance();
    const copies: any[] = [];
    for (let i = 0; i < Math.min(Number(count) || 1, 10); i++) {
      const params: Record<string, any> = { status_option: statusOption };
      if (targetAdsetId) params.adset_id = targetAdsetId;
      copies.push(await fb.copyObject(req.params.id, req.accessToken!, params));
    }
    res.json({ success: true, copies });
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});
