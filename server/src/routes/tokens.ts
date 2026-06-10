import { Router, Response, Request } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/permission';
import {
  addToken,
  removeToken,
  updateTokenStatus,
  updateTokenAssignments,
  listTokens,
  getTokenStats,
  userNeedsBind,
} from '../services/tokenPool';
import { getRecentRateLimitEvents } from '../services/fbRateLimitMonitor';
import { getUserById } from '../models/user';
import { config } from '../config';

export const tokensRouter = Router();
tokensRouter.use(authMiddleware);

// 以下路由只需登录，不需管理员
// GET /api/tokens/connect — Facebook OAuth 一键绑定
tokensRouter.get('/connect', (req: AuthRequest, res: Response) => {
  const state = `${req.userId}_${Math.random().toString(36).substring(2, 8)}`;
  const fbUrl =
    `https://www.facebook.com/${config.facebook.apiVersion}/dialog/oauth?` +
    `client_id=${config.facebook.appId}` +
    `&redirect_uri=${encodeURIComponent('https://fb-auto-analytics.thinkpro.top/api/tokens/connect-callback')}` +
    `&scope=${encodeURIComponent('ads_read,ads_management,business_management,public_profile')}` +
    `&state=${state}`;
  res.json({ redirectUrl: fbUrl });
});

// GET /api/tokens/need-bind — 检查是否需要绑定 Facebook
tokensRouter.get('/need-bind', async (req: AuthRequest, res: Response) => {
  const needed = await userNeedsBind(req.userId!);
  res.json({ needBind: needed });
});

// 以下路由需要管理员
tokensRouter.use(requireAdmin);

// Facebook OAuth 回调（无需认证，在 app.ts 中直接挂载）
export async function handleConnectCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state } = req.query;
    // 从 state 中提取 userId（格式: userId_randomSuffix）
    const userId = typeof state === 'string' ? state.split('_')[0] : undefined;
    if (!code || typeof code !== 'string') {
      res.redirect(`/token-pool?error=${encodeURIComponent('缺少授权码')}`);
      return;
    }

    const axios = (await import('axios')).default;
    const tokenResp = await axios.get(
      `https://graph.facebook.com/${config.facebook.apiVersion}/oauth/access_token`,
      {
        params: {
          client_id: config.facebook.appId,
          client_secret: config.facebook.appSecret,
          redirect_uri: 'https://fb-auto-analytics.thinkpro.top/api/tokens/connect-callback',
          code,
        },
      }
    );

    const shortToken = tokenResp.data.access_token;
    if (!shortToken) {
      res.redirect(`/token-pool?error=${encodeURIComponent('获取 Token 失败')}`);
      return;
    }

    let fbName = '';
    try {
      const meResp = await axios.get(
        `https://graph.facebook.com/${config.facebook.apiVersion}/me`,
        { params: { fields: 'name', access_token: shortToken } }
      );
      fbName = meResp.data.name || '';
    } catch {}

    const result = await addToken(fbName || 'Facebook 用户', shortToken, fbName, userId);
    console.log(`[TokenPool] OAuth connect: added "${fbName}" userId=${userId} (exchanged: ${result.exchanged})`);

    res.redirect(`/connect-facebook?success=${encodeURIComponent(fbName || 'Token')}`);
  } catch (err: any) {
    console.error('[TokenPool] Connect error:', err.response?.data || err.message);
    res.redirect(`/connect-facebook?error=${encodeURIComponent(err.response?.data?.error?.message || err.message || '绑定失败')}`);
  }
}

// GET /api/tokens — 查看 Token 池
tokensRouter.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const tokens = await listTokens();
    res.json({ data: tokens });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tokens/stats — 池统计
tokensRouter.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await getTokenStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tokens/rate-limits — 最近限流事件
tokensRouter.get('/rate-limits', async (_req: AuthRequest, res: Response) => {
  res.json({ data: getRecentRateLimitEvents(30) });
});

// POST /api/tokens — 添加 Token（自动换长效）
tokensRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, accessToken, ownerName } = req.body;
    if (!name || !accessToken) {
      res.status(400).json({ error: '缺少必填字段: name, accessToken' });
      return;
    }
    const result = await addToken(name, accessToken, ownerName);
    res.json({
      data: result.token,
      exchanged: result.exchanged,
      message: result.exchanged ? '已自动换为长效 Token（60天）' : 'Token 已保存',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tokens/:id — 更新 Token 状态或绑定账户
tokensRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status, assignedAccounts } = req.body;
    if (assignedAccounts !== undefined) {
      await updateTokenAssignments(req.params.id, assignedAccounts);
    }
    if (status) {
      await updateTokenStatus(req.params.id, status);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tokens/:id — 删除 Token
tokensRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await removeToken(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
