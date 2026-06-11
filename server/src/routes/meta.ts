import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { FacebookClient } from '../services/facebookClient';
import { fbErrorMessage } from '../utils/fbError';

export const metaRouter = Router();
metaRouter.use(authMiddleware);

// GET /api/meta/pages — FB 主页列表
metaRouter.get('/pages', async (req: AuthRequest, res: Response) => {
  try {
    const pages = await FacebookClient.getInstance().getPages(req.accessToken!);
    res.json(pages.map((p: any) => ({
      id: p.id,
      name: p.name,
      pictureUrl: p.picture?.data?.url || null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});

// GET /api/meta/pixels?accountId= — 像素列表
metaRouter.get('/pixels', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }
    const pixels = await FacebookClient.getInstance().getAdsPixels(
      String(accountId).replace('act_', ''),
      req.accessToken!
    );
    res.json(pixels);
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});

// GET /api/meta/interests?q= — 兴趣定向搜索
metaRouter.get('/interests', async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      res.json([]);
      return;
    }
    const results = await FacebookClient.getInstance().searchTargeting(
      req.accessToken!,
      String(q).trim(),
      'adinterest'
    );
    res.json(results.map((r: any) => ({
      id: r.id,
      name: r.name,
      audienceSize: r.audience_size_upper_bound || r.audience_size || null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});
