import { Pool } from 'pg';
import { config } from '../config';

let shoplazzaPool: Pool | null = null;

export function getShoplazzaPool(): Pool {
  if (!shoplazzaPool) {
    const { host, port, user, password, database, ssl } = config.shoplazzaDb;
    const sslOpt = ssl ? { rejectUnauthorized: false } : false;
    shoplazzaPool = new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl: sslOpt,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return shoplazzaPool;
}

export async function shoplazzaQuery(text: string, params?: any[]): Promise<any[]> {
  const result = await getShoplazzaPool().query(text, params);
  return result.rows;
}

export async function shoplazzaQueryOne(text: string, params?: any[]): Promise<any | null> {
  const rows = await shoplazzaQuery(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function initShoplazzaDatabase(): Promise<void> {
  const pool = getShoplazzaPool();
  await pool.query('SELECT 1');
  console.log(`[ShoplazzaDB] Connected to ${config.shoplazzaDb.host}:${config.shoplazzaDb.port}/${config.shoplazzaDb.database}`);
}
