import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { CampaignService } from '../services/campaignService';

export const campaignsRouter = Router();
campaignsRouter.use(authMiddleware);

// GET /api/campaigns
campaignsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, limit, after } = req.query;
    const service = new CampaignService(req.accessToken!);
    const result = await service.getCampaigns(
      accountId as string,
      limit ? parseInt(limit as string) : 25,
      after as string
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id
campaignsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new CampaignService(req.accessToken!);
    const result = await service.getCampaign(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns
campaignsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, name, objective, status, specialAdCategories } = req.body;
    const service = new CampaignService(req.accessToken!);
    const result = await service.createCampaign(accountId, {
      name,
      objective,
      status: status || 'PAUSED',
      specialAdCategories: specialAdCategories || [],
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/campaigns/:id
campaignsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, status } = req.body;
    const service = new CampaignService(req.accessToken!);
    const result = await service.updateCampaign(req.params.id, { name, status });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/:id
campaignsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new CampaignService(req.accessToken!);
    await service.deleteCampaign(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
