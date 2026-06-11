import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createDraft, deleteDraft, getDraft, listDrafts, updateDraft } from '../models/adDraft';

export const draftsRouter = Router();
draftsRouter.use(authMiddleware);

// GET /api/drafts?accountId=
draftsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }
    res.json(await listDrafts(req.userId!, accountId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drafts/:id
draftsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const draft = await getDraft(req.params.id, req.userId!);
    if (!draft) {
      res.status(404).json({ error: '草稿不存在' });
      return;
    }
    res.json(draft);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drafts  { accountId, name, payload }
draftsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, name, payload } = req.body;
    if (!accountId || !payload) {
      res.status(400).json({ error: '缺少 accountId 或 payload' });
      return;
    }
    res.json(await createDraft(req.userId!, accountId, name || '未命名草稿', payload));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drafts/:id  { name, payload }
draftsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, payload } = req.body;
    const draft = await updateDraft(req.params.id, req.userId!, name || '未命名草稿', payload);
    if (!draft) {
      res.status(404).json({ error: '草稿不存在' });
      return;
    }
    res.json(draft);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drafts/:id
draftsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await deleteDraft(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
