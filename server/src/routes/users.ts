import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/permission';
import { listUsers, setUserPermissions, getUserById } from '../models/user';

export const usersRouter = Router();
usersRouter.use(authMiddleware);

// GET /api/users — 管理员查看所有用户
usersRouter.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await listUsers();
    res.json({ data: users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id — 管理员设置用户权限
usersRouter.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { role, allowedAccounts } = req.body;
    const user = await getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    await setUserPermissions(req.params.id, role || 'viewer', allowedAccounts || []);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
