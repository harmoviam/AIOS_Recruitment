import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;

/** Sanitized PostgreSQL schema name (letters, numbers, underscore only). */
export function getDbSchema(): string {
  const raw = process.env.DB_SCHEMA || 'public';
  const safe = raw.replace(/[^a-zA-Z0-9_]/g, '');
  if (!safe) throw new Error('Invalid DB_SCHEMA environment variable');
  return safe;
}

export const DB_SCHEMA = getDbSchema();

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:harmovia123@localhost:5432/harmoviajobs_courses_db',
  options: `-c search_path=${DB_SCHEMA},public`,
});

/** Ensure schema exists and search_path is set for this connection. */
export async function useSchema(client: pg.PoolClient): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA}`);
  await client.query(`SET search_path TO ${DB_SCHEMA}, public`);
}
