import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getUserById } from '../models/user';
import { getPoolToken } from '../services/tokenPool';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: 'admin' | 'viewer';
  userAllowedAccounts?: string[];
  accessToken?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录，请先通过钉钉登录' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };

    const user = await getUserById(decoded.userId);
    if (!user) {
      res.status(401).json({ error: '用户不存在，请重新登录' });
      return;
    }

    req.userId = user.id;
    req.userRole = (user.role || 'viewer') as 'admin' | 'viewer';
    req.userAllowedAccounts = user.allowed_accounts || [];
    // 从 Token 池中获取 Facebook Token，自动轮换
    req.accessToken = await getPoolToken();
    next();
  } catch (err) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}
