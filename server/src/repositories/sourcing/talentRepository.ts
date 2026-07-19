import { pool } from '../../db.js';
import type { ListQuery } from '../../services/sourcing/pagination.js';
import { toOffsetLimit } from '../../services/sourcing/pagination.js';
import { VersionConflictError } from './countryRepository.js';

function audit(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    tenantId: Number(row.tenant_id),
    createdDate: new Date(String(row.created_date)).toISOString(),
    modifiedDate: new Date(String(row.modified_date)).toISOString(),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    status: String(row.status),
    version: Number(row.version),
  };
}

async function listSimple(table: string, tenantId: number, query: ListQuery) {
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
  return { rows, total: countRes.rows[0].c as number };
}

export async function listQualifications(tenantId: number, query: ListQuery) {
  const { rows, total } = await listSimple('qualification', tenantId, query);
  return {
    items: rows.map((r) => ({
      ...audit(r),
      code: String(r.code),
      name: String(r.name),
      rankOrder: Number(r.rank_order),
    })),
    total,
  };
}

export async function getQualification(tenantId: number, id: string) {
  const { rows } = await pool.query(`SELECT * FROM qualification WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...audit(r), code: String(r.code), name: String(r.name), rankOrder: Number(r.rank_order) };
}

export async function createQualification(
  tenantId: number,
  input: { code: string; name: string; rankOrder?: number; status?: string },
  createdBy: string
) {
  const { rows } = await pool.query(
    `INSERT INTO qualification (tenant_id, code, name, rank_order, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, input.code, input.name, input.rankOrder ?? 0, input.status ?? 'ACTIVE', createdBy]
  );
  const r = rows[0];
  return { ...audit(r), code: String(r.code), name: String(r.name), rankOrder: Number(r.rank_order) };
}

export async function updateQualification(
  tenantId: number,
  id: string,
  input: { code?: string; name?: string; rankOrder?: number; status?: string; version?: number }
) {
  const existing = await getQualification(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) throw new VersionConflictError();
  const sets = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];
  for (const [key, col] of [
    ['code', 'code'],
    ['name', 'name'],
    ['rankOrder', 'rank_order'],
    ['status', 'status'],
  ] as const) {
    if (input[key] !== undefined) {
      params.push(input[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  const { rows } = await pool.query(
    `UPDATE qualification SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    params
  );
  const r = rows[0];
  return r ? { ...audit(r), code: String(r.code), name: String(r.name), rankOrder: Number(r.rank_order) } : null;
}

export async function listExperienceLevels(tenantId: number, query: ListQuery) {
  const { rows, total } = await listSimple('experience_level', tenantId, query);
  return {
    items: rows.map((r) => ({
      ...audit(r),
      code: String(r.code),
      name: String(r.name),
      minYears: r.min_years != null ? Number(r.min_years) : null,
      maxYears: r.max_years != null ? Number(r.max_years) : null,
      rankOrder: Number(r.rank_order),
    })),
    total,
  };
}

export async function getExperienceLevel(tenantId: number, id: string) {
  const { rows } = await pool.query(`SELECT * FROM experience_level WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...audit(r),
    code: String(r.code),
    name: String(r.name),
    minYears: r.min_years != null ? Number(r.min_years) : null,
    maxYears: r.max_years != null ? Number(r.max_years) : null,
    rankOrder: Number(r.rank_order),
  };
}

export async function createExperienceLevel(
  tenantId: number,
  input: { code: string; name: string; minYears?: number | null; maxYears?: number | null; rankOrder?: number; status?: string },
  createdBy: string
) {
  const { rows } = await pool.query(
    `INSERT INTO experience_level (tenant_id, code, name, min_years, max_years, rank_order, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      tenantId,
      input.code,
      input.name,
      input.minYears ?? null,
      input.maxYears ?? null,
      input.rankOrder ?? 0,
      input.status ?? 'ACTIVE',
      createdBy,
    ]
  );
  return getExperienceLevel(tenantId, rows[0].id);
}

export async function updateExperienceLevel(
  tenantId: number,
  id: string,
  input: {
    code?: string;
    name?: string;
    minYears?: number | null;
    maxYears?: number | null;
    rankOrder?: number;
    status?: string;
    version?: number;
  }
) {
  const existing = await getExperienceLevel(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) throw new VersionConflictError();
  const sets = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];
  const map = {
    code: 'code',
    name: 'name',
    minYears: 'min_years',
    maxYears: 'max_years',
    rankOrder: 'rank_order',
    status: 'status',
  } as const;
  for (const [key, col] of Object.entries(map) as Array<[keyof typeof map, string]>) {
    if (input[key] !== undefined) {
      params.push(input[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  await pool.query(`UPDATE experience_level SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2`, params);
  return getExperienceLevel(tenantId, id);
}

export async function listSalaryRanges(tenantId: number, query: ListQuery) {
  const { rows, total } = await listSimple('salary_range', tenantId, query);
  return {
    items: rows.map((r) => ({
      ...audit(r),
      code: String(r.code),
      name: String(r.name),
      minAmount: Number(r.min_amount),
      maxAmount: Number(r.max_amount),
      currency: String(r.currency),
    })),
    total,
  };
}

export async function getSalaryRange(tenantId: number, id: string) {
  const { rows } = await pool.query(`SELECT * FROM salary_range WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...audit(r),
    code: String(r.code),
    name: String(r.name),
    minAmount: Number(r.min_amount),
    maxAmount: Number(r.max_amount),
    currency: String(r.currency),
  };
}

export async function createSalaryRange(
  tenantId: number,
  input: { code: string; name: string; minAmount: number; maxAmount: number; currency?: string; status?: string },
  createdBy: string
) {
  const { rows } = await pool.query(
    `INSERT INTO salary_range (tenant_id, code, name, min_amount, max_amount, currency, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      tenantId,
      input.code,
      input.name,
      input.minAmount,
      input.maxAmount,
      input.currency ?? 'INR',
      input.status ?? 'ACTIVE',
      createdBy,
    ]
  );
  return getSalaryRange(tenantId, rows[0].id);
}

export async function updateSalaryRange(
  tenantId: number,
  id: string,
  input: {
    code?: string;
    name?: string;
    minAmount?: number;
    maxAmount?: number;
    currency?: string;
    status?: string;
    version?: number;
  }
) {
  const existing = await getSalaryRange(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) throw new VersionConflictError();
  const sets = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];
  const map = {
    code: 'code',
    name: 'name',
    minAmount: 'min_amount',
    maxAmount: 'max_amount',
    currency: 'currency',
    status: 'status',
  } as const;
  for (const [key, col] of Object.entries(map) as Array<[keyof typeof map, string]>) {
    if (input[key] !== undefined) {
      params.push(input[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  await pool.query(`UPDATE salary_range SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2`, params);
  return getSalaryRange(tenantId, id);
}

function mapRole(r: Record<string, unknown>) {
  const aliases = r.aliases;
  return {
    ...audit(r),
    code: String(r.code),
    name: String(r.name),
    description: r.description != null ? String(r.description) : null,
    industryId: r.industry_id != null ? String(r.industry_id) : null,
    recruitmentCategoryId: r.recruitment_category_id != null ? String(r.recruitment_category_id) : null,
    aliases: Array.isArray(aliases) ? aliases.map(String) : [],
  };
}

export async function listRoles(tenantId: number, query: ListQuery, filters?: { industryId?: string; categoryId?: string }) {
  const { offset, limit } = toOffsetLimit(query);
  const params: unknown[] = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (filters?.industryId) {
    params.push(filters.industryId);
    where += ` AND industry_id = $${params.length}`;
  }
  if (filters?.categoryId) {
    params.push(filters.categoryId);
    where += ` AND recruitment_category_id = $${params.length}`;
  }
  if (query.status) {
    params.push(query.status);
    where += ` AND status = $${params.length}`;
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    where += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`;
  }
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM sourcing_role ${where}`, params);
  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_role ${where} ORDER BY name ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { items: rows.map(mapRole), total: countRes.rows[0].c as number };
}

export async function getRole(tenantId: number, id: string) {
  const { rows } = await pool.query(`SELECT * FROM sourcing_role WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  return rows[0] ? mapRole(rows[0]) : null;
}

export async function createRole(
  tenantId: number,
  input: {
    code: string;
    name: string;
    description?: string | null;
    industryId?: string | null;
    recruitmentCategoryId?: string | null;
    aliases?: string[];
    status?: string;
  },
  createdBy: string
) {
  const { rows } = await pool.query(
    `INSERT INTO sourcing_role (
       tenant_id, code, name, description, industry_id, recruitment_category_id, aliases, status, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
    [
      tenantId,
      input.code,
      input.name,
      input.description ?? null,
      input.industryId ?? null,
      input.recruitmentCategoryId ?? null,
      JSON.stringify(input.aliases ?? []),
      input.status ?? 'ACTIVE',
      createdBy,
    ]
  );
  return mapRole(rows[0]);
}

export async function updateRole(
  tenantId: number,
  id: string,
  input: {
    code?: string;
    name?: string;
    description?: string | null;
    industryId?: string | null;
    recruitmentCategoryId?: string | null;
    aliases?: string[];
    status?: string;
    version?: number;
  }
) {
  const existing = await getRole(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) throw new VersionConflictError();
  const sets = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];
  const map: Record<string, string> = {
    code: 'code',
    name: 'name',
    description: 'description',
    industryId: 'industry_id',
    recruitmentCategoryId: 'recruitment_category_id',
    status: 'status',
  };
  for (const [key, col] of Object.entries(map)) {
    if ((input as Record<string, unknown>)[key] !== undefined) {
      params.push((input as Record<string, unknown>)[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (input.aliases !== undefined) {
    params.push(JSON.stringify(input.aliases));
    sets.push(`aliases = $${params.length}::jsonb`);
  }
  const { rows } = await pool.query(
    `UPDATE sourcing_role SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    params
  );
  return rows[0] ? mapRole(rows[0]) : null;
}
