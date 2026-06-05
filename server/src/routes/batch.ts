import { Router, Response } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { BatchService } from '../services/batchService';

export const batchRouter = Router();
batchRouter.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/batch/template — Download CSV template
batchRouter.get('/template', (_req: AuthRequest, res: Response) => {
  const csvHeader =
    'campaign_name,adset_name,ad_name,targeting_age_min,targeting_age_max,targeting_gender,targeting_interests,budget_daily,headline,body_text,cta,link,image_url';
  const sampleRow =
    '我的广告系列,我的广告组,广告1,18,65,all,电商购物,1000,限时优惠!,"全场5折起，立即选购",SHOP_NOW,https://example.com,https://example.com/image.jpg';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=fb_batch_ads_template.csv');
  res.send('﻿' + csvHeader + '\n' + sampleRow);
});

// POST /api/batch/upload — Upload CSV and start batch processing
batchRouter.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传 CSV 文件' });
      return;
    }

    const { accountId } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '请指定广告账户' });
      return;
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const service = new BatchService(req.accessToken!, req.userId!);
    const result = await service.processBatch(accountId, csvContent);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch/status/:jobId — Query batch job status
batchRouter.get('/status/:jobId', async (req: AuthRequest, res: Response) => {
  try {
    const service = new BatchService(req.accessToken!, req.userId!);
    const status = await service.getJobStatus(req.params.jobId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
