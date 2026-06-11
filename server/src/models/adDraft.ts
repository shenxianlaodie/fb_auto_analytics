import { query } from './database';

export interface AdDraftRecord {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  payload: any;
  created_at: string;
  updated_at: string;
}

export async function listDrafts(userId: string, accountId: string): Promise<AdDraftRecord[]> {
  return query(
    `SELECT * FROM ad_drafts WHERE user_id = $1 AND account_id = $2 ORDER BY updated_at DESC`,
    [userId, accountId]
  );
}

export async function getDraft(id: string, userId: string): Promise<AdDraftRecord | null> {
  const rows = await query(
    `SELECT * FROM ad_drafts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

export async function createDraft(
  userId: string,
  accountId: string,
  name: string,
  payload: unknown
): Promise<AdDraftRecord> {
  const rows = await query(
    `INSERT INTO ad_drafts (user_id, account_id, name, payload)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, accountId, name, JSON.stringify(payload)]
  );
  return rows[0];
}

export async function updateDraft(
  id: string,
  userId: string,
  name: string,
  payload: unknown
): Promise<AdDraftRecord | null> {
  const rows = await query(
    `UPDATE ad_drafts SET name = $3, payload = $4, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, name, JSON.stringify(payload)]
  );
  return rows[0] || null;
}

export async function deleteDraft(id: string, userId: string): Promise<void> {
  await query(`DELETE FROM ad_drafts WHERE id = $1 AND user_id = $2`, [id, userId]);
}
