process.env.SYNC_WORKER = '1';

import cron from 'node-cron';
import { initDatabase } from './models/database';
import {
  runMetricsCron,
  runShoplazzaCron,
} from './services/syncSchedulerService';
import { runSpuTopCron } from './services/spuTopSyncService';
import { runHistoryBackfillCron } from './services/historyBackfillService';

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

  // FB 指标 + 结构：每 5 分钟（合并调度，避免重复扫账户）
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runMetricsCron();
    } catch (err: any) {
      console.error('[SyncWorker] Metrics/Structure sync failed:', err.message);
    }
  });

  // SPU TOP 榜：每 5 分钟
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runSpuTopCron();
    } catch (err: any) {
      console.error('[SyncWorker] SPU TOP sync failed:', err.message);
    }
  });

  // 历史指标回填：每日凌晨 3:30 低峰期（过去 30 天按天落库）
  cron.schedule('30 3 * * *', async () => {
    try {
      await runHistoryBackfillCron();
    } catch (err: any) {
      console.error('[SyncWorker] History backfill failed:', err.message);
    }
  });

  console.log('[SyncWorker] Running: Shoplazza 5min / Metrics+Structure 5min / SpuTop 5min / HistoryBackfill 03:30');
}

start().catch((err) => {
  console.error('[SyncWorker] Failed to start:', err);
  process.exit(1);
});
