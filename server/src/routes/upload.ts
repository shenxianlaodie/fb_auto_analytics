import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { FacebookClient } from '../services/facebookClient';

export const uploadRouter = Router();
uploadRouter.use(authMiddleware);

const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.avi'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}`));
    }
  },
});

// POST /api/upload/image — Upload ad image
uploadRouter.post('/image', upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传图片文件' });
      return;
    }

    const { accountId } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '请指定广告账户' });
      return;
    }

    const fbClient = FacebookClient.getInstance();
    const imageHash = await fbClient.uploadAdImage(accountId, req.file.path, req.accessToken!);

    res.json({ hash: imageHash, filename: req.file.filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload/video — Upload ad video
uploadRouter.post('/video', upload.single('video'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传视频文件' });
      return;
    }

    const { accountId } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '请指定广告账户' });
      return;
    }

    const fbClient = FacebookClient.getInstance();
    const videoId = await fbClient.uploadAdVideo(accountId, req.file.path, req.accessToken!);

    res.json({ videoId, filename: req.file.filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
