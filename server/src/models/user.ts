import { query, queryOne } from './database';

export interface User {
  id: string;
  facebook_user_id: string;
  name: string | null;
  email: string | null;
  access_token: string;
  token_expires_at: string | null;
  accounts_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertUser(data: {
  facebookUserId: string;
  name?: string;
  email?: string;
  accessToken: string;
  tokenExpiresAt?: string;
}): Promise<User> {
  const result = await queryOne(
    `INSERT INTO users (facebook_user_id, name, email, access_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (facebook_user_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       access_token = EXCLUDED.access_token,
       token_expires_at = EXCLUDED.token_expires_at,
       updated_at = NOW()
     RETURNING *`,
    [
      data.facebookUserId,
      data.name || null,
      data.email || null,
      data.accessToken,
      data.tokenExpiresAt || null,
    ]
  );
  return result as User;
}

export async function getUserByFacebookId(facebookUserId: string): Promise<User | null> {
  return queryOne('SELECT * FROM users WHERE facebook_user_id = $1', [facebookUserId]);
}

export async function getUserById(id: string): Promise<User | null> {
  return queryOne('SELECT * FROM users WHERE id = $1', [id]);
}

export async function touchAccountsSyncedAt(userId: string): Promise<void> {
  await queryOne(
    `UPDATE users SET accounts_synced_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id`,
    [userId]
  );
}
