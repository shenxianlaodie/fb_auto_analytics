import { query, queryOne } from './database';

export interface BatchJob {
  id: string;
  user_id: string;
  ad_account_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_count: number;
  success_count: number;
  failed_count: number;
  progress: number;
  results: string;
  created_at: string;
  updated_at: string;
}

export interface BatchResult {
  row: number;
  adName: string;
  status: 'success' | 'failed';
  adId?: string;
  error?: string;
}

export async function createBatchJob(userId: string, adAccountId: string, totalCount: number): Promise<BatchJob> {
  return queryOne(
    `INSERT INTO batch_jobs (user_id, ad_account_id, total_count)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, adAccountId, totalCount]
  ) as Promise<BatchJob>;
}

export async function getBatchJob(id: string): Promise<BatchJob | null> {
  return queryOne('SELECT * FROM batch_jobs WHERE id = $1', [id]);
}

export async function updateBatchProgress(
  id: string,
  updates: {
    status?: string;
    successCount?: number;
    failedCount?: number;
    progress?: number;
    results?: BatchResult[];
  }
): Promise<void> {
  const sets: string[] = ["updated_at = NOW()"];
  const params: any[] = [];
  let idx = 1;

  if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }
  if (updates.successCount !== undefined) { sets.push(`success_count = $${idx++}`); params.push(updates.successCount); }
  if (updates.failedCount !== undefined) { sets.push(`failed_count = $${idx++}`); params.push(updates.failedCount); }
  if (updates.progress !== undefined) { sets.push(`progress = $${idx++}`); params.push(updates.progress); }
  if (updates.results !== undefined) { sets.push(`results = $${idx++}`); params.push(JSON.stringify(updates.results)); }

  params.push(id);
  await query(`UPDATE batch_jobs SET ${sets.join(', ')} WHERE id = $${idx}`, params);
}
