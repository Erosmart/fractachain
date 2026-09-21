/**
 * Restore point for Postgres-backed persistence.
 *
 * Runs BEFORE the API server starts (see Dockerfile CMD): pulls every row of
 * `kv_store` into data/<key>.json so the modules that snapshot their state at
 * require-time boot with the last persisted contents instead of the empty
 * files baked into the image. No DATABASE_URL → no-op, files stay as shipped.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ALLOWED = new Set(['users.json', 'listings.json', 'orderbook.json', 'dividends.json', 'testnet.json']);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[pg] sin DATABASE_URL — arranque con archivos locales');
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())',
    );
    const res = await pool.query('SELECT key, data FROM kv_store');
    let n = 0;
    for (const row of res.rows) {
      if (!ALLOWED.has(row.key)) continue;
      fs.writeFileSync(path.join(DATA_DIR, row.key), JSON.stringify(row.data, null, 2));
      n++;
    }
    console.log(`[pg] restaurados ${n} documentos desde Postgres`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[pg] restore falló (arranca con archivos locales):', e.message);
  process.exit(0); // nunca bloquea el arranque
});
