import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AdService } from '../services/adService';

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
