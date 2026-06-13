import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { CampaignService } from '../services/campaignService';
import { AdSetService } from '../services/adSetService';
import { AdService } from '../services/adService';
import { writeBackCampaign, writeBackAdset, writeBackAd } from '../models/fbStructure';
import { fbErrorMessage } from '../utils/fbError';
import { resolveFbWriteToken } from '../utils/fbWriteToken';

export const bulkRouter = Router();
bulkRouter.use(authMiddleware);

// POST /api/bulk/status — 批量开启/暂停，逐条容错
bulkRouter.post('/status', async (req: AuthRequest, res: Response) => {
  const { level, ids, status } = req.body as {
    level: 'campaign' | 'adset' | 'ad';
    ids: string[];
    status: 'ACTIVE' | 'PAUSED';
  };
  if (
    !['campaign', 'adset', 'ad'].includes(level) ||
    !Array.isArray(ids) || ids.length === 0 ||
    !['ACTIVE', 'PAUSED'].includes(status)
  ) {
    res.status(400).json({ error: '参数错误' });
    return;
  }

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids.slice(0, 50)) {
    try {
      const token = await resolveFbWriteToken({ entityId: id, level });
      if (level === 'campaign') {
        await new CampaignService(token).updateCampaign(id, { status });
        await writeBackCampaign(id, { status });
      } else if (level === 'adset') {
        await new AdSetService(token).updateAdSet(id, { status });
        await writeBackAdset(id, { status });
      } else {
        await new AdService(token).updateAd(id, { status });
        await writeBackAd(id, { status });
      }
      succeeded.push(id);
    } catch (err: any) {
      failed.push({ id, error: fbErrorMessage(err) });
    }
  }
  res.json({ succeeded, failed });
});
