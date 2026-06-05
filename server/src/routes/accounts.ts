import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { FacebookClient } from '../services/facebookClient';

export const accountsRouter = Router();
accountsRouter.use(authMiddleware);

// GET /api/accounts
accountsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const fbClient = FacebookClient.getInstance();
    const accounts = await fbClient.getAdAccounts(req.accessToken!);
    console.log(`[Accounts] User ${req.userId} has ${accounts.length} ad accounts`);
    res.json({ data: accounts });
  } catch (err: any) {
    console.error('[Accounts] Failed to fetch ad accounts:', err.message);
    res.status(500).json({ error: err.message });
  }
});
