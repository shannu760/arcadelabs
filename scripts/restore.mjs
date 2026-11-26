/* Restore a backup written by scripts/backup.mjs.

     SUPABASE_DB_URL='postgres://…' node scripts/restore.mjs .backups/<stamp> --yes

   Every table in the manifest is truncated and refilled inside one transaction,
   so a failure leaves the database exactly as it was. `--yes` is required: this
   overwrites live data. Take a fresh backup first (scripts/backup.mjs).
*/
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const { Pool } = pg;
const args = process.argv.slice(2).filter((arg) => arg !== '--yes');
const confirmed = process.argv.includes('--yes');
const dir = resolve(args[0] || '');
const connection = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();

if (!connection) {
  console.error('Set SUPABASE_DB_URL (or DATABASE_URL).');
  process.exit(1);
}
if (!args[0] || !confirmed) {
  console.error('Usage: node scripts/restore.mjs <backup-directory> --yes');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connection,
  max: 2,
  ssl: /sslmode=disable/.test(connection) ? false : { rejectUnauthorized: false },
});

try {
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  const files = new Set(await readdir(dir));

  const client = await pool.connect();
  try {
    await client.query('begin');

    // One statement for the whole backup: nothing is dropped, only refilled.
    const tables = manifest.tables
      .filter((entry) => files.has(entry.file))
      .map((entry) => `public."${entry.table}"`)
      .join(', ');

    if (!tables) throw new Error('The manifest names no tables that exist in this directory');

    await client.query(`truncate table ${tables} restart identity cascade`);

    for (const entry of manifest.tables) {
      if (!files.has(entry.file)) continue;
      const rows = JSON.parse(await readFile(resolve(dir, entry.file), 'utf8'));
      if (!rows.length) {
        console.log(`  ${entry.table}: empty`);
        continue;
      }
      await client.query(
        `insert into public."${entry.table}"
         select * from json_populate_recordset(null::public."${entry.table}", $1::jsonb)`,
        [JSON.stringify(rows)]
      );
      console.log(`  ${entry.table}: ${rows.length} rows restored`);
    }

    // bigserial columns (error_reports) need their sequence moved past the data.
    for (const entry of manifest.tables) {
      await client
        .query(
          `do $$
           declare m bigint;
           begin
             select coalesce(max(id), 0) into m from public."${entry.table}";
             if m > 0 then
               perform setval(pg_get_serial_sequence('public."${entry.table}"', 'id'), m);
             end if;
           exception when undefined_column then null;
           when undefined_table then null;
           end $$;`
        )
        .catch(() => null);
    }

    await client.query('commit');
    console.log(`\nrestored ${manifest.tables.length} tables from ${dir}`);
  } catch (err) {
    await client.query('rollback').catch(() => null);
    throw err;
  } finally {
    client.release();
  }
} catch (err) {
  console.error('restore failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
