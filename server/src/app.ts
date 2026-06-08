import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { config } from './config';
import { initDatabase } from './models/database';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import {
  runMetricsCron,
  runShoplazzaCron,
  runStructureCron,
} from './services/syncSchedulerService';

// Import routes
import { authRouter } from './routes/auth';
import { accountsRouter } from './routes/accounts';
import { campaignsRouter } from './routes/campaigns';
import { adsetsRouter } from './routes/adsets';
import { adsRouter } from './routes/ads';
import { insightsRouter } from './routes/insights';
import { batchRouter } from './routes/batch';
import { uploadRouter } from './routes/upload';
import { analyticsRouter } from './routes/analytics';

const app = express();

// Middleware
app.use(cors({
  origin: `https://localhost:${config.server.clientPort}`,
  credentials: true,
}));
app.use(express.json());
app.use(rateLimitMiddleware);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/adsets', adsetsRouter);
app.use('/api/ads', adsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/batch', batchRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/analytics', analyticsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    await initDatabase();

    const sslOptions = {
      key: fs.readFileSync(path.resolve(__dirname, '../key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../cert.pem')),
    };

    https.createServer(sslOptions, app).listen(config.server.port, () => {
      console.log(`[Server] FB Auto Analytics running on https://localhost:${config.server.port}`);
      console.log(`[Server] Client: https://localhost:${config.server.clientPort}`);
    });

    // Shoplazza UTM：每 5 分钟
    cron.schedule('*/5 * * * *', async () => {
      try {
        await runShoplazzaCron();
      } catch (err: any) {
        console.error('[Cron] Shoplazza sync failed:', err.message);
      }
    });

    // FB 指标：每 15 分钟（1 次 insights/ad）
    cron.schedule('*/15 * * * *', async () => {
      try {
        await runMetricsCron();
      } catch (err: any) {
        console.error('[Cron] Metrics sync failed:', err.message);
      }
    });

    // FB 结构：每 6 小时
    cron.schedule('15 */6 * * *', async () => {
      try {
        await runStructureCron();
      } catch (err: any) {
        console.error('[Cron] Structure sync failed:', err.message);
      }
    });

    console.log('[Cron] UTM 5min (hot 2min) / Metrics 15min (hot 2min) / Structure 6h');
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();

export default app;
