import { pool } from '../../db.js';
import type { CountryCreateInput, CountryDto, CountryUpdateInput } from '../../dto/sourcing/geo.js';
import type { ListQuery } from '../../services/sourcing/pagination.js';
import { toOffsetLimit } from '../../services/sourcing/pagination.js';
import { mapCountry } from './geoMappers.js';

const SORT_MAP: Record<string, string> = {
  name: 'name',
  code: 'code',
  createdDate: 'created_date',
  modifiedDate: 'modified_date',
};

export class VersionConflictError extends Error {
  code = 'VERSION_CONFLICT';
  constructor() {
    super('Version conflict');
    this.name = 'VersionConflictError';
  }
}

export async function listCountries(
  tenantId: number,
  query: ListQuery
): Promise<{ items: CountryDto[]; total: number }> {
  const { offset, limit } = toOffsetLimit(query);
  const sortCol = SORT_MAP[query.sort || 'name'] || 'name';
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

  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM sourcing_country ${where}`, params);
  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_country ${where}
     ORDER BY ${sortCol} ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { items: rows.map(mapCountry), total: countRes.rows[0].c };
}

export async function getCountryById(tenantId: number, id: string): Promise<CountryDto | null> {
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_country WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rows[0] ? mapCountry(rows[0]) : null;
}

export async function createCountry(
  tenantId: number,
  input: CountryCreateInput,
  createdBy: string
): Promise<CountryDto> {
  const { rows } = await pool.query(
    `INSERT INTO sourcing_country (tenant_id, code, name, phone_code, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, input.code, input.name, input.phoneCode ?? null, input.status ?? 'ACTIVE', createdBy]
  );
  return mapCountry(rows[0]);
}

export async function updateCountry(
  tenantId: number,
  id: string,
  input: CountryUpdateInput
): Promise<CountryDto | null> {
  const existing = await getCountryById(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) {
    throw new VersionConflictError();
  }

  const sets: string[] = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];

  if (input.code !== undefined) {
    params.push(input.code);
    sets.push(`code = $${params.length}`);
  }
  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  if (input.phoneCode !== undefined) {
    params.push(input.phoneCode);
    sets.push(`phone_code = $${params.length}`);
  }
  if (input.status !== undefined) {
    params.push(input.status);
    sets.push(`status = $${params.length}`);
  }

  const { rows } = await pool.query(
    `UPDATE sourcing_country SET ${sets.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    params
  );
  return rows[0] ? mapCountry(rows[0]) : null;
}
