import { pool } from '../../db.js';
import type { ListQuery } from '../../services/sourcing/pagination.js';
import { toOffsetLimit } from '../../services/sourcing/pagination.js';
import { VersionConflictError } from './countryRepository.js';

export interface CodeNameRow {
  id: string;
  tenantId: number;
  code: string;
  name: string;
  description: string | null;
  createdDate: string;
  modifiedDate: string;
  createdBy: string | null;
  status: string;
  version: number;
  [key: string]: unknown;
}

function mapBase(row: Record<string, unknown>): CodeNameRow {
  return {
    id: String(row.id),
    tenantId: Number(row.tenant_id),
    code: String(row.code),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    createdDate: new Date(String(row.created_date)).toISOString(),
    modifiedDate: new Date(String(row.modified_date)).toISOString(),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    status: String(row.status),
    version: Number(row.version),
  };
}

const ALLOWED_TABLES = new Set([
  'recruitment_category',
  'sourcing_industry',
  'source_category',
  'qualification',
  'experience_level',
  'salary_range',
  'sourcing_role',
]);

export function createCodeNameRepository(table: string) {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Unsupported master table: ${table}`);

  return {
    async list(tenantId: number, query: ListQuery) {
      const { offset, limit } = toOffsetLimit(query);
      const params: unknown[] = [tenantId];
      let where = 'WHERE tenant_id = $1';
      if (query.status) {
        params.push(query.status);
        where += ` AND status = $${params.length}`;
      }
      if (query.q) {
        params.push(`%${query.q}%`);
        where += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`;
      }
      const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table} ${where}`, params);
      const listParams = [...params, limit, offset];
      const { rows } = await pool.query(
        `SELECT * FROM ${table} ${where} ORDER BY name ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      return { items: rows.map(mapBase), total: countRes.rows[0].c as number };
    },

    async getById(tenantId: number, id: string) {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      return rows[0] ? mapBase(rows[0]) : null;
    },

    async create(
      tenantId: number,
      input: { code: string; name: string; description?: string | null; status?: string },
      createdBy: string
    ) {
      const { rows } = await pool.query(
        `INSERT INTO ${table} (tenant_id, code, name, description, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [tenantId, input.code, input.name, input.description ?? null, input.status ?? 'ACTIVE', createdBy]
      );
      return mapBase(rows[0]);
    },

    async update(
      tenantId: number,
      id: string,
      input: { code?: string; name?: string; description?: string | null; status?: string; version?: number }
    ) {
      const existing = await this.getById(tenantId, id);
      if (!existing) return null;
      if (input.version !== undefined && input.version !== existing.version) throw new VersionConflictError();

      const sets = ['modified_date = NOW()', 'version = version + 1'];
      const params: unknown[] = [tenantId, id];
      if (input.code !== undefined) {
        params.push(input.code);
        sets.push(`code = $${params.length}`);
      }
      if (input.name !== undefined) {
        params.push(input.name);
        sets.push(`name = $${params.length}`);
      }
      if (input.description !== undefined) {
        params.push(input.description);
        sets.push(`description = $${params.length}`);
      }
      if (input.status !== undefined) {
        params.push(input.status);
        sets.push(`status = $${params.length}`);
      }
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        params
      );
      return rows[0] ? mapBase(rows[0]) : null;
    },
  };
}

export const recruitmentCategoryRepo = createCodeNameRepository('recruitment_category');
export const industryRepo = createCodeNameRepository('sourcing_industry');
export const sourceCategoryRepo = createCodeNameRepository('source_category');
