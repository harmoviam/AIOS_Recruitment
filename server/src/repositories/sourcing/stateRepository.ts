import { pool } from '../../db.js';
import type { StateCreateInput, StateDto, StateUpdateInput } from '../../dto/sourcing/geo.js';
import type { ListQuery } from '../../services/sourcing/pagination.js';
import { toOffsetLimit } from '../../services/sourcing/pagination.js';
import { VersionConflictError } from './countryRepository.js';
import { mapState } from './geoMappers.js';

const SORT_MAP: Record<string, string> = {
  name: 'name',
  code: 'code',
  createdDate: 'created_date',
  modifiedDate: 'modified_date',
};

export async function listStates(
  tenantId: number,
  query: ListQuery,
  countryId?: string
): Promise<{ items: StateDto[]; total: number }> {
  const { offset, limit } = toOffsetLimit(query);
  const sortCol = SORT_MAP[query.sort || 'name'] || 'name';
  const params: unknown[] = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (countryId) {
    params.push(countryId);
    where += ` AND country_id = $${params.length}`;
  }
  if (query.status) {
    params.push(query.status);
    where += ` AND status = $${params.length}`;
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    where += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`;
  }

  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM sourcing_state ${where}`, params);
  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_state ${where}
     ORDER BY ${sortCol} ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { items: rows.map(mapState), total: countRes.rows[0].c };
}

export async function getStateById(tenantId: number, id: string): Promise<StateDto | null> {
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_state WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rows[0] ? mapState(rows[0]) : null;
}

export async function createState(
  tenantId: number,
  input: StateCreateInput,
  createdBy: string
): Promise<StateDto> {
  const { rows } = await pool.query(
    `INSERT INTO sourcing_state (tenant_id, country_id, code, name, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, input.countryId, input.code, input.name, input.status ?? 'ACTIVE', createdBy]
  );
  return mapState(rows[0]);
}

export async function updateState(
  tenantId: number,
  id: string,
  input: StateUpdateInput
): Promise<StateDto | null> {
  const existing = await getStateById(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) {
    throw new VersionConflictError();
  }

  const sets: string[] = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];

  if (input.countryId !== undefined) {
    params.push(input.countryId);
    sets.push(`country_id = $${params.length}`);
  }
  if (input.code !== undefined) {
    params.push(input.code);
    sets.push(`code = $${params.length}`);
  }
  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  if (input.status !== undefined) {
    params.push(input.status);
    sets.push(`status = $${params.length}`);
  }

  const { rows } = await pool.query(
    `UPDATE sourcing_state SET ${sets.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    params
  );
  return rows[0] ? mapState(rows[0]) : null;
}
