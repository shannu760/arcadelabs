/* Logical backup of the Student Icon database.

     SUPABASE_DB_URL='postgres://…' node scripts/backup.mjs

   Writes one JSON file per public table plus a manifest into
   .backups/<timestamp>/. Restore with scripts/restore.mjs.

   This is a logical dump, not a physical one: it is enough to rebuild the
   application data (profiles, XP, projects, arcade records), and it is not a
   substitute for the provider's own point-in-time backups. Take one before any
   migration or restore.
*/
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { Pool } = pg;
const connection = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();

if (!connection) {
  console.error('Set SUPABASE_DB_URL (or DATABASE_URL) to the database you want to back up.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = resolve('.backups', stamp);

let target = 'postgres';
try {
  const url = new URL(connection);
  target = `${url.hostname}${url.port ? ':' + url.port : ''}/${url.pathname.replace(/^\//, '')}`;
} catch {
  /* keep the generic label */
}

const pool = new Pool({
  connectionString: connection,
  max: 2,
  ssl: /sslmode=disable/.test(connection) ? false : { rejectUnauthorized: false },
});

try {
  await mkdir(dir, { recursive: true });

  const { rows: tables } = await pool.query(`
    select table_name
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  `);

  const manifest = { createdAt: new Date().toISOString(), target, tables: [] };

  for (const { table_name: table } of tables) {
    const { rows } = await pool.query(`select * from public."${table}"`);
    const file = `${table}.json`;
    await writeFile(resolve(dir, file), JSON.stringify(rows, null, 2));
    manifest.tables.push({ table, file, rows: rows.length });
    console.log(`  ${table}: ${rows.length} rows`);
  }

  await writeFile(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nbackup written to ${dir} (${manifest.tables.length} tables, ${target})`);
} catch (err) {
  console.error('backup failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
