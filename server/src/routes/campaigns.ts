import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { CampaignService } from '../services/campaignService';
import { upsertFbCampaign, writeBackCampaign } from '../models/fbStructure';
import { FacebookClient } from '../services/facebookClient';
import { sendFbError } from '../utils/fbError';

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
    sendFbError(res, err);
  }
});

// GET /api/campaigns/:id
campaignsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new CampaignService(req.accessToken!);
    const result = await service.getCampaign(req.params.id);
    res.json(result);
  } catch (err: any) {
    sendFbError(res, err);
  }
});

// POST /api/campaigns
campaignsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, name, objective, status, specialAdCategories } = req.body;
    if (!accountId || !name || !objective) {
      res.status(400).json({ error: '缺少 accountId、名称或广告目标' });
      return;
    }
    const service = new CampaignService(req.accessToken!);
    const result = await service.createCampaign(accountId, {
      name,
      objective,
      status: status || 'PAUSED',
      specialAdCategories: specialAdCategories || [],
    });
    const acctId = String(accountId).replace(/^act_/, '');
    await upsertFbCampaign({
      adAccountId: acctId,
      campaignId: result.id,
      name,
      status: status || 'PAUSED',
      objective,
      dailyBudget: null,
      lifetimeBudget: null,
    });
    res.json(result);
  } catch (err: any) {
    sendFbError(res, err);
  }
});

// PUT /api/campaigns/:id
campaignsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, status, budget } = req.body;
    const service = new CampaignService(req.accessToken!);
    const result = await service.updateCampaign(req.params.id, { name, status, budget });
    // FB 更新成功后立即写回本地库，前端无需等下一轮同步
    await writeBackCampaign(req.params.id, {
      status,
      dailyBudgetCents: budget?.daily,
      lifetimeBudgetCents: budget?.lifetime,
    });
    res.json(result);
  } catch (err: any) {
    sendFbError(res, err);
  }
});

// DELETE /api/campaigns/:id
campaignsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new CampaignService(req.accessToken!);
    await service.deleteCampaign(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    sendFbError(res, err);
  }
});

// POST /api/campaigns/:id/copy — 复制广告系列（深复制，含子组/广告）
campaignsRouter.post('/:id/copy', async (req: AuthRequest, res: Response) => {
  try {
    const { count = 1, statusOption = 'PAUSED' } = req.body;
    const fb = FacebookClient.getInstance();
    const copies: any[] = [];
    for (let i = 0; i < Math.min(Number(count) || 1, 10); i++) {
      const result = await fb.copyObject(req.params.id, req.accessToken!, {
        deep_copy: true,
        status_option: statusOption,
      });
      copies.push(result);
    }
    res.json({ success: true, copies });
  } catch (err: any) {
    sendFbError(res, err);
  }
});
