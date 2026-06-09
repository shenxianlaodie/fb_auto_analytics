const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: false,
});

async function run() {
  const client = await pool.connect();
  try {
    const users = await client.query(`SELECT * FROM users ORDER BY updated_at DESC LIMIT 5`);
    console.log('All users:', JSON.stringify(users.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

run();
