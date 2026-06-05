import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getUserById } from '../models/user';

export interface AuthRequest extends Request {
  userId?: string;
  accessToken?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录，请先授权 Facebook 账号' });
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
    req.accessToken = user.access_token;
    next();
  } catch (err) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}
