import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { InsightsService } from '../services/insightsService';

export const insightsRouter = Router();
insightsRouter.use(authMiddleware);

// GET /api/insights/dashboard — merged endpoint (overview + trends + campaigns)
insightsRouter.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, dateStart, dateEnd } = req.query;
    const service = new InsightsService(req.accessToken!);
    const result = await service.getDashboard(
      accountId as string,
      dateStart as string,
      dateEnd as string
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/hierarchy — merged endpoint (campaigns + adsets + ads)
insightsRouter.get('/hierarchy', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, dateStart, dateEnd, limit } = req.query;
    const service = new InsightsService(req.accessToken!);
    const result = await service.getHierarchy(
      accountId as string,
      dateStart as string,
      dateEnd as string,
      limit ? parseInt(limit as string) : 200
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/overview
insightsRouter.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, dateStart, dateEnd } = req.query;
    const service = new InsightsService(req.accessToken!);
    const result = await service.getOverview(
      accountId as string,
      dateStart as string,
      dateEnd as string
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/campaigns
insightsRouter.get('/campaigns', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, dateStart, dateEnd, limit } = req.query;
    const service = new InsightsService(req.accessToken!);
    const result = await service.getCampaignInsights(
      accountId as string,
      dateStart as string,
      dateEnd as string,
      limit ? parseInt(limit as string) : 50
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/adsets
insightsRouter.get('/adsets', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, campaignId, dateStart, dateEnd, limit } = req.query;
    const service = new InsightsService(req.accessToken!);
    const result = await service.getAdSetInsights(
      accountId as string,
      campaignId as string,
      dateStart as string,
      dateEnd as string,
      limit ? parseInt(limit as string) : 50
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/ads
insightsRouter.get('/ads', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, adsetId, dateStart, dateEnd, limit } = req.query;
    const service = new InsightsService(req.accessToken!);
    const result = await service.getAdInsights(
      accountId as string,
      adsetId as string,
      dateStart as string,
      dateEnd as string,
      limit ? parseInt(limit as string) : 50
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/trends
insightsRouter.get('/trends', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, dateStart, dateEnd, breakdown } = req.query;
    const service = new InsightsService(req.accessToken!);
    const result = await service.getTrends(
      accountId as string,
      dateStart as string,
      dateEnd as string,
      (breakdown as string) || 'daily'
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
