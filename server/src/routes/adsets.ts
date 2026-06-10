import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AdSetService } from '../services/adSetService';
import { writeBackAdset } from '../models/fbStructure';

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
    res.status(500).json({ error: err.message });
  }
});

adsetsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new AdSetService(req.accessToken!);
    const result = await service.getAdSet(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adsetsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, campaignId, name, targeting, budget, bidStrategy, status, startTime, endTime } = req.body;
    const service = new AdSetService(req.accessToken!);
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
    res.status(500).json({ error: err.message });
  }
});

adsetsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, status, budget } = req.body;
    const service = new AdSetService(req.accessToken!);
    const result = await service.updateAdSet(req.params.id, { name, status, budget });
    // FB 更新成功后立即写回本地库，前端无需等下一轮同步
    await writeBackAdset(req.params.id, {
      status,
      dailyBudgetCents: budget?.daily,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adsetsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const service = new AdSetService(req.accessToken!);
    await service.deleteAdSet(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
