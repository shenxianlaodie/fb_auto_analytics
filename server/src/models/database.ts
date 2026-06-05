import { Pool, PoolClient } from 'pg';
import { config } from '../config';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_user_id TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL,
  account_name TEXT,
  currency TEXT,
  timezone TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  ad_account_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  results JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cached_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  breakdown TEXT DEFAULT '',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_account_id, insight_type, date_range_start, date_range_end, breakdown)
);

CREATE TABLE IF NOT EXISTS ad_hourly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('campaign', 'adset', 'ad')),
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  parent_id TEXT,
  snapshot_hour TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpm NUMERIC(10,4) DEFAULT 0,
  cpc NUMERIC(10,4) DEFAULT 0,
  roas NUMERIC(10,4) DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  purchase_value NUMERIC(12,2) DEFAULT 0,
  cost_per_purchase NUMERIC(10,4) DEFAULT 0,
  inline_link_clicks INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  cost_per_unique_click NUMERIC(10,4) DEFAULT 0,
  add_to_cart INTEGER DEFAULT 0,
  cost_per_add_to_cart NUMERIC(10,4) DEFAULT 0,
  initiate_checkout INTEGER DEFAULT 0,
  cost_per_initiate_checkout NUMERIC(10,4) DEFAULT 0,
  add_payment_info INTEGER DEFAULT 0,
  cost_per_add_payment_info NUMERIC(10,4) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_hour ON ad_hourly_snapshots(ad_account_id, snapshot_hour);
CREATE INDEX IF NOT EXISTS idx_snapshots_entity ON ad_hourly_snapshots(ad_account_id, level, entity_id);
`;

let pool: Pool;
let initialized = false;

export async function initDatabase(): Promise<Pool> {
  if (initialized) return pool;

  const { host, port, user, password, database, ssl } = config.db;
  const sslOpt = ssl ? { rejectUnauthorized: false } : false;

  // Step 1: Connect to default 'postgres' db to ensure our DB exists
  const bootstrapPool = new Pool({ host, port, user, password, database: 'postgres', ssl: sslOpt });
  try {
    const client = await bootstrapPool.connect();
    try {
      const exists = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`, [database]
      );
      if (exists.rows.length === 0) {
        await client.query(`CREATE DATABASE "${database}"`);
        console.log(`[DB] Created database: ${database}`);
      }
    } finally {
      client.release();
    }
  } finally {
    await bootstrapPool.end();
  }

  // Step 2: Connect to target database and create tables
  pool = new Pool({ host, port, user, password, database, ssl: sslOpt, max: 10, idleTimeoutMillis: 30000 });
  const client: PoolClient = await pool.connect();
  try {
    await client.query(SCHEMA);
    initialized = true;
    console.log('[DB] PostgreSQL tables initialized');
    console.log(`[DB] Connected to ${host}:${port}/${database}`);
  } finally {
    client.release();
  }

  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

export async function query(text: string, params?: any[]): Promise<any[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne(text: string, params?: any[]): Promise<any | null> {
  const rows = await query(text, params);
  return rows.length > 0 ? rows[0] : null;
}
