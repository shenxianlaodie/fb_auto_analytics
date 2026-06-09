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
    // Find the DingTalk user that just logged in (most recent)
    const users = await client.query(
      `SELECT id, dingtalk_user_id, name, email, role FROM users WHERE dingtalk_user_id IS NOT NULL ORDER BY updated_at DESC LIMIT 5`
    );
    console.log('Recent DingTalk users:');
    console.log(JSON.stringify(users.rows, null, 2));

    // Set the first one as admin
    if (users.rows.length > 0) {
      const user = users.rows[0];
      await client.query(
        `UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = $1`,
        [user.id]
      );
      console.log(`\n✅ Set user ${user.name || user.dingtalk_user_id} (${user.id}) as admin`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run();
