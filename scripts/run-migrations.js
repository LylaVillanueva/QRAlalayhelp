const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const directory = path.join(__dirname, '../src/db/migrations');
  const requested = process.argv.slice(2);
  const files = (requested.length ? requested : fs.readdirSync(directory)).sort();
  for (const file of files) {
    if (!/^\d+_[a-z0-9_]+\.sql$/.test(file) || !fs.existsSync(path.join(directory, file))) throw new Error(`Unknown migration: ${file}`);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('resqr-schema-migrations'))");
    await client.query('create table if not exists schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())');
    for (const file of files) {
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('select checksum from schema_migrations where name = $1', [file]);
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration was changed: ${file}`);
        console.log(`Already applied: ${file}`); continue;
      }
      if (file === '001_init.sql') {
        const existing = await client.query(
          "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE table_schema = 'public' AND table_name = 'users'");
        if (Number(existing.rows[0].n) > 0) throw new Error('An existing schema was found. Run only the new migration: npm run migrate -- 004_account_management.sql');
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log(`Applied: ${file}`);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
