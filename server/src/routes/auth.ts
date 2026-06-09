import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { config } from '../config';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { upsertDingTalkUser, getUserById } from '../models/user';

export const authRouter = Router();

// GET /api/auth/login — 返回钉钉授权 URL
authRouter.get('/login', (_req: Request, res: Response) => {
  const state = Math.random().toString(36).substring(2);
  const dingtalkLoginUrl =
    `https://login.dingtalk.com/oauth2/auth?` +
    `redirect_uri=${encodeURIComponent(config.dingtalk.redirectUri)}` +
    `&response_type=code` +
    `&client_id=${config.dingtalk.appKey}` +
    `&scope=openid` +
    `&state=${state}` +
    `&prompt=consent`;

  res.json({ redirectUrl: dingtalkLoginUrl });
});

// GET /api/auth/dingtalk-callback — 钉钉 OAuth 回调
authRouter.get('/dingtalk-callback', async (req: Request, res: Response) => {
  try {
    console.log('[DingTalk] Callback received, query:', JSON.stringify(req.query));

    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      console.error('[DingTalk] No code in callback');
      res.redirect(`/login?error=${encodeURIComponent('缺少授权码')}`);
      return;
    }

    // Step 1: Exchange auth code for access token
    console.log('[DingTalk] Step 1: exchanging code for token...');
    const tokenResp = await axios.post(
      'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
      {
        clientId: config.dingtalk.appKey,
        clientSecret: config.dingtalk.appSecret,
        code,
        grantType: 'authorization_code',
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('[DingTalk] Step 1 response:', JSON.stringify(tokenResp.data));
    const { accessToken } = tokenResp.data;
    let unionId = tokenResp.data.unionId || '';

    // Step 2: Get user info
    let nick = '';
    let avatarUrl = '';
    let email = '';

    try {
      const userResp = await axios.get(
        'https://api.dingtalk.com/v1.0/contact/users/me',
        { headers: { 'x-acs-dingtalk-access-token': accessToken } }
      );
      console.log('[DingTalk] Step 2 user info:', JSON.stringify(userResp.data));
      nick = userResp.data.nick || '';
      avatarUrl = userResp.data.avatarUrl || '';
      email = userResp.data.email || '';
      // unionId may come from user info if not in token response
      if (!unionId) {
        unionId = userResp.data.unionId || userResp.data.openId || '';
      }
      console.log('[DingTalk] Got unionId:', unionId, 'nick:', nick);
    } catch (err: any) {
      console.warn('[DingTalk] Failed to fetch user profile:', err.response?.data || err.message);
    }

    if (!unionId) {
      console.error('[DingTalk] No unionId from either token or user info!');
      res.redirect(`/login?error=${encodeURIComponent('获取用户标识失败')}`);
      return;
    }

    // Step 3: Upsert user in DB
    console.log('[DingTalk] Step 3: upserting user...');
    const user = await upsertDingTalkUser({
      dingtalkUserId: unionId,
      name: nick,
      email,
      avatar: avatarUrl,
    });
    console.log('[DingTalk] Step 3: user upserted, id:', user.id);

    // Step 4: Issue JWT
    const jwtToken = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: '7d' as any,
    });
    console.log('[DingTalk] Step 4: JWT issued');

    // Step 5: Redirect to frontend callback
    const frontendBase = `https://${req.get('host') || `localhost:${config.server.port}`}`;
    const clientUrl = `${frontendBase}/auth/callback?token=${jwtToken}`;
    console.log('[DingTalk] Step 5: redirecting to:', clientUrl);
    res.redirect(clientUrl);
  } catch (err: any) {
    console.error('[DingTalk] OAuth callback error:', JSON.stringify(err.response?.data || err.message || err));
    const frontendBase = `https://${req.get('host') || `localhost:${config.server.port}`}`;
    const clientUrl = `${frontendBase}/login?error=${encodeURIComponent(err.response?.data?.message || err.message || '钉钉登录失败')}`;
    res.redirect(clientUrl);
  }
});

// GET /api/auth/status — 检查登录状态
authRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.json({ authenticated: false });
      return;
    }

    const decoded = jwt.verify(authHeader.split(' ')[1], config.jwt.secret) as { userId: string };
    res.json({ authenticated: true, userId: decoded.userId });
  } catch {
    res.json({ authenticated: false });
  }
});

// GET /api/auth/me — 返回当前用户信息（角色、权限）
authRouter.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role || 'viewer',
    allowedAccounts: user.allowed_accounts || [],
  });
});
