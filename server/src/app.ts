import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { initDatabase } from './models/database';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';

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
import { bulkRouter } from './routes/bulk';
import { usersRouter } from './routes/users';
import { tokensRouter, handleConnectCallback } from './routes/tokens';

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(rateLimitMiddleware);

// Routes
app.get('/api/tokens/connect-callback', handleConnectCallback);
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/adsets', adsetsRouter);
app.use('/api/ads', adsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/batch', batchRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/bulk', bulkRouter);
app.use('/api/users', usersRouter);
app.use('/api/tokens', tokensRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Production: serve client static files
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // SPA fallback: non-API requests return index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  console.log('[Server] Serving static files from', clientDistPath);
}

// Error handler (must be last)
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    await initDatabase();

    const sslOptions = {
      key: fs.readFileSync('/etc/letsencrypt/live/fb-auto-analytics.thinkpro.top/privkey.pem'),
      cert: fs.readFileSync('/etc/letsencrypt/live/fb-auto-analytics.thinkpro.top/fullchain.pem'),
    };

    https.createServer(sslOptions, app).listen(config.server.port, () => {
      console.log(`[Server] FB Auto Analytics running on https://localhost:${config.server.port}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();

export default app;
