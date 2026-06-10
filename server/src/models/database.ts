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
  is_active BOOLEAN DEFAULT true,
  sync_tier TEXT DEFAULT 'auto',
  ad_count_cache INTEGER DEFAULT 0,
  empty_structure_streak INTEGER DEFAULT 0,
  dormant_since TIMESTAMPTZ,
  sync_priority BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS fb_token_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  owner_name TEXT,
  user_id UUID REFERENCES users(id),
  assigned_accounts JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active',
  cooldown_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  call_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS fb_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  post_id TEXT,
  story_id TEXT,
  spend NUMERIC(12,2) DEFAULT 0,
  budget NUMERIC(12,2) DEFAULT 0,
  cpm NUMERIC(10,4) DEFAULT 0,
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_account_id, ad_id, date_start, date_end)
);

CREATE INDEX IF NOT EXISTS idx_fb_ads_account_dates ON fb_ads(ad_account_id, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_fb_ads_post_id ON fb_ads(post_id);

CREATE TABLE IF NOT EXISTS shoplazza_utm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL DEFAULT '',
  dimension TEXT NOT NULL CHECK (dimension IN ('utm_content', 'utm_campaign')),
  utm_value TEXT NOT NULL,
  uv INTEGER DEFAULT 0,
  pv INTEGER DEFAULT 0,
  add_to_cart INTEGER DEFAULT 0,
  begin_checkout INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  sales NUMERIC(12,2) DEFAULT 0,
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, dimension, utm_value, date_start, date_end)
);

CREATE INDEX IF NOT EXISTS idx_shoplazza_utm_value ON shoplazza_utm(utm_value);
CREATE INDEX IF NOT EXISTS idx_shoplazza_utm_dimension ON shoplazza_utm(dimension, date_start, date_end);

CREATE TABLE IF NOT EXISTS fb_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  objective TEXT,
  daily_budget TEXT,
  lifetime_budget TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_account_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS fb_adsets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  campaign_id TEXT,
  name TEXT,
  status TEXT,
  daily_budget TEXT,
  lifetime_budget TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_account_id, adset_id)
);

CREATE TABLE IF NOT EXISTS fb_ads_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  adset_id TEXT,
  campaign_id TEXT,
  name TEXT,
  status TEXT,
  creative JSONB,
  post_id TEXT,
  story_id TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ad_account_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_adsets_campaign ON fb_adsets(ad_account_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_fb_ads_meta_adset ON fb_ads_meta(ad_account_id, adset_id);

CREATE TABLE IF NOT EXISTS account_shop_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL UNIQUE,
  account_name TEXT,
  shop_id TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  shop_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_shop_mapping_shop ON account_shop_mapping(shop_id);

CREATE TABLE IF NOT EXISTS shop_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL UNIQUE,
  shop_domain TEXT NOT NULL UNIQUE,
  shop_name TEXT,
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_tokens_active ON shop_tokens(is_active);

CREATE TABLE IF NOT EXISTS shoplazza_spu_top (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  shop_name TEXT,
  stat_date TEXT NOT NULL,
  collection_id TEXT NOT NULL DEFAULT '',
  collection_title TEXT,
  rank INT NOT NULL,
  spu TEXT NOT NULL,
  product_id TEXT,
  title TEXT,
  image_url TEXT,
  product_created_at TEXT,
  order_count INT DEFAULT 0,
  add_cart_users INT DEFAULT 0,
  view_users INT DEFAULT 0,
  add_to_cart_rate NUMERIC(10,4) DEFAULT 0,
  transform_rate NUMERIC(10,4) DEFAULT 0,
  composite_score NUMERIC(12,4) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, stat_date, collection_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_spu_top_lookup
  ON shoplazza_spu_top(stat_date, shop_id, collection_id);

CREATE TABLE IF NOT EXISTS shoplazza_spu_top_meta (
  shop_id TEXT NOT NULL,
  stat_date TEXT NOT NULL,
  collection_id TEXT NOT NULL DEFAULT '',
  manual_order BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (shop_id, stat_date, collection_id)
);

CREATE TABLE IF NOT EXISTS spu_top_column_order (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  column_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('structure', 'metrics', 'utm')),
  date_start TEXT NOT NULL DEFAULT '',
  date_end TEXT NOT NULL DEFAULT '',
  shop_id TEXT NOT NULL DEFAULT '',
  last_synced_at TIMESTAMPTZ,
  refreshing BOOLEAN DEFAULT false,
  UNIQUE(ad_account_id, sync_type, date_start, date_end, shop_id)
);
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
    await client.query(`ALTER TABLE shoplazza_utm ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE shoplazza_utm ADD COLUMN IF NOT EXISTS add_to_cart INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE shoplazza_utm ADD COLUMN IF NOT EXISTS begin_checkout INTEGER DEFAULT 0`);
    await client.query(`
      ALTER TABLE shoplazza_utm
      DROP CONSTRAINT IF EXISTS shoplazza_utm_dimension_utm_value_date_start_date_end_key
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shoplazza_utm_shop_unique
      ON shoplazza_utm(shop_id, dimension, utm_value, date_start, date_end)
    `);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accounts_synced_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS sync_tier TEXT DEFAULT 'auto'`);
    await client.query(`ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS ad_count_cache INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS empty_structure_streak INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS dormant_since TIMESTAMPTZ`);
    await client.query(`ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS sync_priority BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE shoplazza_spu_top ADD COLUMN IF NOT EXISTS product_created_at TEXT`);
    await client.query(`ALTER TABLE shoplazza_spu_top ADD COLUMN IF NOT EXISTS composite_score NUMERIC(12,4) DEFAULT 0`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS fb_token_pool (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        access_token TEXT NOT NULL,
        owner_name TEXT,
        user_id UUID REFERENCES users(id),
        assigned_accounts JSONB DEFAULT '[]'::jsonb,
        status TEXT DEFAULT 'active',
        cooldown_until TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        call_count INTEGER DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE fb_token_pool ADD COLUMN IF NOT EXISTS assigned_accounts JSONB DEFAULT '[]'::jsonb`);
    await client.query(`ALTER TABLE fb_token_pool ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)`);
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
