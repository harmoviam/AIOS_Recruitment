import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;

/** Sanitized PostgreSQL schema name (letters, numbers, underscore only). */
export function getDbSchema(): string {
  const fromEnv = process.env.DB_SCHEMA;
  if (fromEnv) {
    const safe = fromEnv.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safe) throw new Error('Invalid DB_SCHEMA environment variable');
    return safe;
  }

  const url = process.env.DATABASE_URL || '';
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (match) {
    const safe = decodeURIComponent(match[1]).replace(/[^a-zA-Z0-9_]/g, '');
    if (safe) return safe;
  }

  return 'public';
}

/** Strip non-pg query params (e.g. schema=) before passing to node-postgres. */
export function getConnectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    'postgresql://postgres:harmovia123@localhost:5432/harmoviajobs_courses_db';
  return url
    .replace(/([?&])schema=[^&]*(?=&|$)/i, '$1')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
}

export const DB_SCHEMA = getDbSchema();

export const pool = new Pool({
  connectionString: getConnectionString(),
  options: `-c search_path=${DB_SCHEMA},public`,
});

/** Ensure schema exists and search_path is set for this connection. */
export async function useSchema(client: pg.PoolClient): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA}`);
  await client.query(`SET search_path TO ${DB_SCHEMA}, public`);
}
