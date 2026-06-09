import cron from 'node-cron';
import { initDatabase } from './models/database';
import {
  runMetricsCron,
  runShoplazzaCron,
  runStructureCron,
} from './services/syncSchedulerService';

async function start() {
  await initDatabase();
  console.log('[SyncWorker] Database connected, starting cron jobs...');

  // Shoplazza UTM：每 5 分钟
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runShoplazzaCron();
    } catch (err: any) {
      console.error('[SyncWorker] Shoplazza sync failed:', err.message);
    }
  });

  // FB 指标：每 15 分钟
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runMetricsCron();
    } catch (err: any) {
      console.error('[SyncWorker] Metrics sync failed:', err.message);
    }
  });

  // FB 结构：每 6 小时
  cron.schedule('15 */6 * * *', async () => {
    try {
      await runStructureCron();
    } catch (err: any) {
      console.error('[SyncWorker] Structure sync failed:', err.message);
    }
  });

  console.log('[SyncWorker] Running: Shoplazza 5min / Metrics 15min / Structure 6h');
}

start().catch((err) => {
  console.error('[SyncWorker] Failed to start:', err);
  process.exit(1);
});
