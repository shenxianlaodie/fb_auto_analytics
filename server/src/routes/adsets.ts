import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AdSetService } from '../services/adSetService';
import { writeBackAdset } from '../models/fbStructure';
import { FacebookClient } from '../services/facebookClient';
import { sendFbError } from '../utils/fbError';
import { validateCreateAdSet } from '../utils/adValidators';
import { resolveFbWriteToken } from '../utils/fbWriteToken';

export const adsetsRouter = Router();
adsetsRouter.use(authMiddleware);

adsetsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, campaignId, limit, after } = req.query;
    console.log(`[AdSets] Query: accountId=${accountId}, campaignId=${campaignId}`);
    const service = new AdSetService(req.accessToken!);
    const result = await service.getAdSets(
      accountId as string,
      campaignId as string,
      limit ? parseInt(limit as string) : 25,
      after as string
    );
    console.log(`[AdSets] Returned: ${result.data?.length || 0} adsets`);
    res.json(result);
  } catch (err: any) {
    console.error('[AdSets] Error:', err.message);
    sendFbError(res, err);
  }
});

adsetsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new AdSetService(req.accessToken!);
    const result = await service.getAdSet(req.params.id);
    res.json(result);
  } catch (err: any) {
    sendFbError(res, err);
  }
});

adsetsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const validationError = validateCreateAdSet(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const { accountId, campaignId, name, targeting, budget, bidStrategy, status, startTime, endTime } = req.body;
    const service = new AdSetService(await resolveFbWriteToken({ accountId: accountId as string }));
    const result = await service.createAdSet(accountId, {
      campaignId,
      name,
      targeting,
      budget,
      bidStrategy: bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
      status: status || 'PAUSED',
      startTime,
      endTime,
    });
    res.json(result);
  } catch (err: any) {
    sendFbError(res, err);
  }
});

adsetsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, status, budget } = req.body;
    const service = new AdSetService(await resolveFbWriteToken({ entityId: req.params.id, level: 'adset' }));
    const result = await service.updateAdSet(req.params.id, { name, status, budget });
    // FB 更新成功后立即写回本地库，前端无需等下一轮同步
    await writeBackAdset(req.params.id, {
      status,
      dailyBudgetCents: budget?.daily,
      lifetimeBudgetCents: budget?.lifetime,
    });
    res.json(result);
  } catch (err: any) {
    sendFbError(res, err);
  }
});

adsetsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new AdSetService(await resolveFbWriteToken({ entityId: req.params.id, level: 'adset' }));
    await service.deleteAdSet(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    sendFbError(res, err);
  }
});

// POST /api/adsets/:id/copy — 复制广告组（可指定目标系列）
adsetsRouter.post('/:id/copy', async (req: AuthRequest, res: Response) => {
  try {
    const { count = 1, statusOption = 'PAUSED', targetCampaignId } = req.body;
    const token = await resolveFbWriteToken({ entityId: req.params.id, level: 'adset' });
    const fb = FacebookClient.getInstance();
    const copies: any[] = [];
    for (let i = 0; i < Math.min(Number(count) || 1, 10); i++) {
      const params: Record<string, any> = { deep_copy: true, status_option: statusOption };
      if (targetCampaignId) params.campaign_id = targetCampaignId;
      copies.push(await fb.copyObject(req.params.id, token, params));
    }
    res.json({ success: true, copies });
  } catch (err: any) {
    sendFbError(res, err);
  }
});
