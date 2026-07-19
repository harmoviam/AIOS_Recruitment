import { pool } from '../../db.js';
import type { ListQuery } from '../../services/sourcing/pagination.js';
import { toOffsetLimit } from '../../services/sourcing/pagination.js';
import { VersionConflictError } from './countryRepository.js';

function mapSource(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    tenantId: Number(r.tenant_id),
    sourceCategoryId: String(r.source_category_id),
    cityId: r.city_id != null ? String(r.city_id) : null,
    stateId: r.state_id != null ? String(r.state_id) : null,
    name: String(r.name),
    channelType: String(r.channel_type),
    locationText: r.location_text != null ? String(r.location_text) : null,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    website: r.website != null ? String(r.website) : null,
    contactPerson: r.contact_person != null ? String(r.contact_person) : null,
    phone: r.phone != null ? String(r.phone) : null,
    email: r.email != null ? String(r.email) : null,
    notes: r.notes != null ? String(r.notes) : null,
    memberCount: r.member_count != null ? Number(r.member_count) : null,
    dailyActiveMembers: r.daily_active_members != null ? Number(r.daily_active_members) : null,
    postingRules: r.posting_rules != null ? String(r.posting_rules) : null,
    lastVerified: r.last_verified != null ? String(r.last_verified).slice(0, 10) : null,
    qualityRating: r.quality_rating != null ? Number(r.quality_rating) : null,
    responseRate: r.response_rate != null ? Number(r.response_rate) : null,
    estimatedCandidatePool: r.estimated_candidate_pool != null ? Number(r.estimated_candidate_pool) : null,
    createdDate: new Date(String(r.created_date)).toISOString(),
    modifiedDate: new Date(String(r.modified_date)).toISOString(),
    createdBy: r.created_by != null ? String(r.created_by) : null,
    status: String(r.status),
    version: Number(r.version),
  };
}

export type SourceInput = {
  sourceCategoryId?: string;
  cityId?: string | null;
  stateId?: string | null;
  name?: string;
  channelType?: string;
  locationText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  website?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  memberCount?: number | null;
  dailyActiveMembers?: number | null;
  postingRules?: string | null;
  lastVerified?: string | null;
  qualityRating?: number | null;
  responseRate?: number | null;
  estimatedCandidatePool?: number | null;
  roleIds?: string[];
  industryIds?: string[];
  experienceLevelIds?: string[];
  languages?: Array<{ code: string; name: string }>;
  tags?: string[];
  status?: string;
  version?: number;
};

async function replaceLinks(
  client: { query: typeof pool.query },
  tenantId: number,
  sourceId: string,
  createdBy: string,
  input: SourceInput
) {
  if (input.roleIds) {
    await client.query(`DELETE FROM source_role WHERE source_id = $1 AND tenant_id = $2`, [sourceId, tenantId]);
    for (const roleId of input.roleIds) {
      await client.query(
        `INSERT INTO source_role (tenant_id, source_id, role_id, created_by) VALUES ($1,$2,$3,$4)`,
        [tenantId, sourceId, roleId, createdBy]
      );
    }
  }
  if (input.industryIds) {
    await client.query(`DELETE FROM source_industry WHERE source_id = $1 AND tenant_id = $2`, [sourceId, tenantId]);
    for (const industryId of input.industryIds) {
      await client.query(
        `INSERT INTO source_industry (tenant_id, source_id, industry_id, created_by) VALUES ($1,$2,$3,$4)`,
        [tenantId, sourceId, industryId, createdBy]
      );
    }
  }
  if (input.experienceLevelIds) {
    await client.query(`DELETE FROM source_experience_level WHERE source_id = $1 AND tenant_id = $2`, [
      sourceId,
      tenantId,
    ]);
    for (const experienceLevelId of input.experienceLevelIds) {
      await client.query(
        `INSERT INTO source_experience_level (tenant_id, source_id, experience_level_id, created_by)
         VALUES ($1,$2,$3,$4)`,
        [tenantId, sourceId, experienceLevelId, createdBy]
      );
    }
  }
  if (input.languages) {
    await client.query(`DELETE FROM source_language WHERE source_id = $1 AND tenant_id = $2`, [sourceId, tenantId]);
    for (const lang of input.languages) {
      await client.query(
        `INSERT INTO source_language (tenant_id, source_id, language_code, language_name, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, sourceId, lang.code, lang.name, createdBy]
      );
    }
  }
  if (input.tags) {
    await client.query(`DELETE FROM source_tag WHERE source_id = $1 AND tenant_id = $2`, [sourceId, tenantId]);
    for (const tag of input.tags) {
      await client.query(
        `INSERT INTO source_tag (tenant_id, source_id, tag, created_by) VALUES ($1,$2,$3,$4)`,
        [tenantId, sourceId, tag, createdBy]
      );
    }
  }
}

async function loadLinks(tenantId: number, sourceId: string) {
  const [roles, industries, experience, languages, tags] = await Promise.all([
    pool.query(`SELECT role_id FROM source_role WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'`, [
      tenantId,
      sourceId,
    ]),
    pool.query(
      `SELECT industry_id FROM source_industry WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'`,
      [tenantId, sourceId]
    ),
    pool.query(
      `SELECT experience_level_id FROM source_experience_level WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'`,
      [tenantId, sourceId]
    ),
    pool.query(
      `SELECT language_code AS code, language_name AS name FROM source_language
       WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'`,
      [tenantId, sourceId]
    ),
    pool.query(`SELECT tag FROM source_tag WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'`, [
      tenantId,
      sourceId,
    ]),
  ]);
  return {
    roleIds: roles.rows.map((r) => String(r.role_id)),
    industryIds: industries.rows.map((r) => String(r.industry_id)),
    experienceLevelIds: experience.rows.map((r) => String(r.experience_level_id)),
    languages: languages.rows.map((r) => ({ code: String(r.code), name: String(r.name) })),
    tags: tags.rows.map((r) => String(r.tag)),
  };
}

export async function listSources(
  tenantId: number,
  query: ListQuery,
  filters?: { cityId?: string; categoryId?: string; channelType?: string; roleId?: string }
) {
  const { offset, limit } = toOffsetLimit(query);
  const params: unknown[] = [tenantId];
  let where = 'WHERE s.tenant_id = $1';
  if (filters?.cityId) {
    params.push(filters.cityId);
    where += ` AND s.city_id = $${params.length}`;
  }
  if (filters?.categoryId) {
    params.push(filters.categoryId);
    where += ` AND s.source_category_id = $${params.length}`;
  }
  if (filters?.channelType) {
    params.push(filters.channelType);
    where += ` AND s.channel_type = $${params.length}`;
  }
  if (filters?.roleId) {
    params.push(filters.roleId);
    where += ` AND EXISTS (
      SELECT 1 FROM source_role sr WHERE sr.source_id = s.id AND sr.role_id = $${params.length} AND sr.status = 'ACTIVE'
    )`;
  }
  if (query.status) {
    params.push(query.status);
    where += ` AND s.status = $${params.length}`;
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    where += ` AND s.name ILIKE $${params.length}`;
  }
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM source s ${where}`, params);
  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT s.* FROM source s ${where} ORDER BY s.name ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { items: rows.map(mapSource), total: countRes.rows[0].c as number };
}

export async function getSourceById(tenantId: number, id: string) {
  const { rows } = await pool.query(`SELECT * FROM source WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  if (!rows[0]) return null;
  const links = await loadLinks(tenantId, id);
  return { ...mapSource(rows[0]), ...links };
}

export async function createSource(tenantId: number, input: SourceInput, createdBy: string) {
  if (!input.sourceCategoryId || !input.name || !input.channelType) {
    throw new Error('sourceCategoryId, name, and channelType are required');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO source (
         tenant_id, source_category_id, city_id, state_id, name, channel_type, location_text,
         latitude, longitude, website, contact_person, phone, email, notes, member_count,
         daily_active_members, posting_rules, last_verified, quality_rating, response_rate,
         estimated_candidate_pool, status, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11,$12,$13,$14,$15,
         $16,$17,$18,$19,$20,
         $21,$22,$23
       ) RETURNING *`,
      [
        tenantId,
        input.sourceCategoryId,
        input.cityId ?? null,
        input.stateId ?? null,
        input.name,
        input.channelType,
        input.locationText ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.website ?? null,
        input.contactPerson ?? null,
        input.phone ?? null,
        input.email || null,
        input.notes ?? null,
        input.memberCount ?? null,
        input.dailyActiveMembers ?? null,
        input.postingRules ?? null,
        input.lastVerified ?? null,
        input.qualityRating ?? null,
        input.responseRate ?? null,
        input.estimatedCandidatePool ?? null,
        input.status ?? 'ACTIVE',
        createdBy,
      ]
    );
    const sourceId = String(rows[0].id);
    await replaceLinks(client, tenantId, sourceId, createdBy, input);
    await client.query('COMMIT');
    return getSourceById(tenantId, sourceId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSource(tenantId: number, id: string, input: SourceInput, createdBy: string) {
  const existing = await getSourceById(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) throw new VersionConflictError();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sets = ['modified_date = NOW()', 'version = version + 1'];
    const params: unknown[] = [tenantId, id];
    const map: Record<string, string> = {
      sourceCategoryId: 'source_category_id',
      cityId: 'city_id',
      stateId: 'state_id',
      name: 'name',
      channelType: 'channel_type',
      locationText: 'location_text',
      latitude: 'latitude',
      longitude: 'longitude',
      website: 'website',
      contactPerson: 'contact_person',
      phone: 'phone',
      email: 'email',
      notes: 'notes',
      memberCount: 'member_count',
      dailyActiveMembers: 'daily_active_members',
      postingRules: 'posting_rules',
      lastVerified: 'last_verified',
      qualityRating: 'quality_rating',
      responseRate: 'response_rate',
      estimatedCandidatePool: 'estimated_candidate_pool',
      status: 'status',
    };
    for (const [key, col] of Object.entries(map)) {
      if ((input as Record<string, unknown>)[key] !== undefined) {
        const val = (input as Record<string, unknown>)[key];
        params.push(key === 'email' && val === '' ? null : val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    await client.query(`UPDATE source SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2`, params);
    await replaceLinks(client, tenantId, id, createdBy, input);
    await client.query('COMMIT');
    return getSourceById(tenantId, id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Candidates for recommendation engine (Sprint 6). */
export async function findSourcesForRecommendation(
  tenantId: number,
  filters: { cityId?: string; roleId?: string; experienceLevelId?: string; languages?: string[] }
) {
  const params: unknown[] = [tenantId];
  let where = `WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'`;
  if (filters.cityId) {
    params.push(filters.cityId);
    where += ` AND (s.city_id = $${params.length} OR s.city_id IS NULL)`;
  }
  if (filters.roleId) {
    params.push(filters.roleId);
    where += ` AND (
      EXISTS (SELECT 1 FROM source_role sr WHERE sr.source_id = s.id AND sr.role_id = $${params.length} AND sr.status = 'ACTIVE')
      OR NOT EXISTS (SELECT 1 FROM source_role sr2 WHERE sr2.source_id = s.id AND sr2.status = 'ACTIVE')
    )`;
  }
  const { rows } = await pool.query(`SELECT s.* FROM source s ${where}`, params);
  const items = [];
  for (const row of rows) {
    const links = await loadLinks(tenantId, String(row.id));
    items.push({ ...mapSource(row), ...links });
  }
  return items;
}
