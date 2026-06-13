import { query, queryOne } from './database';

export interface User {
  id: string;
  facebook_user_id: string | null;
  dingtalk_user_id: string | null;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: 'admin' | 'viewer';
  allowed_accounts: string[];
  access_token: string | null;
  token_expires_at: string | null;
  accounts_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Facebook user (legacy, kept for backward compat) ---

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

// --- DingTalk user ---

export async function upsertDingTalkUser(data: {
  dingtalkUserId: string;
  name?: string;
  email?: string;
  avatar?: string;
}): Promise<User> {
  const result = await queryOne(
    `INSERT INTO users (dingtalk_user_id, name, email, avatar, role, allowed_accounts)
     VALUES ($1, $2, $3, $4, 'viewer', '{}')
     ON CONFLICT (dingtalk_user_id)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, users.name),
       email = COALESCE(EXCLUDED.email, users.email),
       avatar = COALESCE(EXCLUDED.avatar, users.avatar),
       updated_at = NOW()
     RETURNING *`,
    [
      data.dingtalkUserId,
      data.name || null,
      data.email || null,
      data.avatar || null,
    ]
  );
  return result as User;
}

export async function getUserByDingTalkId(dingtalkUserId: string): Promise<User | null> {
  return queryOne('SELECT * FROM users WHERE dingtalk_user_id = $1', [dingtalkUserId]);
}

// --- Common ---

export async function getUserById(id: string): Promise<User | null> {
  return queryOne('SELECT * FROM users WHERE id = $1', [id]);
}

export async function touchAccountsSyncedAt(userId: string): Promise<void> {
  await queryOne(
    `UPDATE users SET accounts_synced_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id`,
    [userId]
  );
}

// --- Permission management ---

export async function setUserPermissions(
  userId: string,
  role: string,
  allowedAccounts: string[]
): Promise<void> {
  await query(
    `UPDATE users SET role = $1, allowed_accounts = $2, updated_at = NOW() WHERE id = $3`,
    [role, allowedAccounts, userId]
  );
}

export async function listUsers(): Promise<User[]> {
  return query(
    `SELECT id, dingtalk_user_id, name, email, avatar, role, allowed_accounts, created_at, updated_at
     FROM users WHERE dingtalk_user_id IS NOT NULL
     ORDER BY created_at DESC`
  );
}
