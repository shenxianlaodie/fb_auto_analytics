import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { upsertUser } from '../models/user';
import { FacebookClient } from '../services/facebookClient';

export const authRouter = Router();

// GET /api/auth/login — Redirect to Facebook OAuth
authRouter.get('/login', (_req: Request, res: Response) => {
  const fbLoginUrl =
    `https://www.facebook.com/${config.facebook.apiVersion}/dialog/oauth?` +
    `client_id=${config.facebook.appId}` +
    `&redirect_uri=${encodeURIComponent(config.facebook.redirectUri)}` +
    `&scope=${encodeURIComponent('ads_read,ads_management,business_management,public_profile')}` +
    `&state=${Math.random().toString(36).substring(2)}`;

  res.json({ redirectUrl: fbLoginUrl });
});

// GET /api/auth/callback — Handle OAuth callback
authRouter.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: '缺少授权码' });
      return;
    }

    // Exchange code for access token
    const fbClient = FacebookClient.getInstance();
    const tokenData = await fbClient.exchangeCodeForToken(code);

    // Get user profile
    const profile = await fbClient.getUserProfile(tokenData.access_token);

    // Upsert user in DB
    const user = await upsertUser({
      facebookUserId: profile.id,
      name: profile.name,
      email: profile.email,
      accessToken: tokenData.access_token,
      tokenExpiresAt: tokenData.expires_at
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : undefined,
    });

    // Generate JWT
    const jwtToken = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: '7d' as any,
    });

    // Redirect to frontend with token
    const clientUrl = `https://localhost:${config.server.clientPort}/auth/callback?token=${jwtToken}`;
    res.redirect(clientUrl);
  } catch (err: any) {
    console.error('[Auth] OAuth callback error:', err);
    const clientUrl = `https://localhost:${config.server.clientPort}/login?error=${encodeURIComponent(err.message || '登录失败')}`;
    res.redirect(clientUrl);
  }
});

// GET /api/auth/status — Check login status
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

// POST /api/auth/refresh — Refresh Facebook token
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { token: userToken } = req.body;

    if (!userToken) {
      res.status(400).json({ error: '缺少 token' });
      return;
    }

    const fbClient = FacebookClient.getInstance();
    const newToken = await fbClient.refreshLongLivedToken(userToken);

    res.json({ accessToken: newToken.access_token, expiresIn: newToken.expires_in });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Token 刷新失败' });
  }
});
