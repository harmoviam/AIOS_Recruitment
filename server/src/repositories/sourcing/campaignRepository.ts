import { pool } from '../../db.js';
import type { ListQuery } from '../../services/sourcing/pagination.js';
import { toOffsetLimit } from '../../services/sourcing/pagination.js';
import { VersionConflictError } from './countryRepository.js';

function mapCampaign(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    tenantId: Number(r.tenant_id),
    recruiterUserId: Number(r.recruiter_user_id),
    roleId: String(r.role_id),
    cityId: String(r.city_id),
    experienceLevelId: r.experience_level_id != null ? String(r.experience_level_id) : null,
    name: String(r.name),
    hiringCount: Number(r.hiring_count),
    joiningTimelineDays: r.joining_timeline_days != null ? Number(r.joining_timeline_days) : null,
    salaryMin: r.salary_min != null ? Number(r.salary_min) : null,
    salaryMax: r.salary_max != null ? Number(r.salary_max) : null,
    shiftType: r.shift_type != null ? String(r.shift_type) : null,
    genderPreference: r.gender_preference != null ? String(r.gender_preference) : null,
    startDate: r.start_date != null ? String(r.start_date).slice(0, 10) : null,
    endDate: r.end_date != null ? String(r.end_date).slice(0, 10) : null,
    notes: r.notes != null ? String(r.notes) : null,
    createdDate: new Date(String(r.created_date)).toISOString(),
    modifiedDate: new Date(String(r.modified_date)).toISOString(),
    createdBy: r.created_by != null ? String(r.created_by) : null,
    status: String(r.status),
    version: Number(r.version),
  };
}

export async function listCampaigns(tenantId: number, query: ListQuery, recruiterUserId?: number) {
  const { offset, limit } = toOffsetLimit(query);
  const params: unknown[] = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (recruiterUserId) {
    params.push(recruiterUserId);
    where += ` AND recruiter_user_id = $${params.length}`;
  }
  if (query.status) {
    params.push(query.status);
    where += ` AND status = $${params.length}`;
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    where += ` AND name ILIKE $${params.length}`;
  }
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM sourcing_campaign ${where}`, params);
  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_campaign ${where} ORDER BY created_date DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { items: rows.map(mapCampaign), total: countRes.rows[0].c as number };
}

export async function getCampaignSources(tenantId: number, campaignId: string) {
  const { rows } = await pool.query(
    `SELECT cs.*, s.name AS source_name, s.channel_type
     FROM campaign_source cs
     JOIN source s ON s.id = cs.source_id
     WHERE cs.tenant_id = $1 AND cs.campaign_id = $2 AND cs.status = 'ACTIVE'
     ORDER BY cs.priority ASC`,
    [tenantId, campaignId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    campaignId: String(r.campaign_id),
    sourceId: String(r.source_id),
    sourceName: String(r.source_name),
    channelType: String(r.channel_type),
    priority: Number(r.priority),
    allocatedTarget: r.allocated_target != null ? Number(r.allocated_target) : null,
    notes: r.notes != null ? String(r.notes) : null,
  }));
}

export async function getCampaignById(tenantId: number, id: string) {
  const { rows } = await pool.query(`SELECT * FROM sourcing_campaign WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
  if (!rows[0]) return null;
  const sources = await getCampaignSources(tenantId, id);
  return { ...mapCampaign(rows[0]), sources };
}

export async function createCampaign(
  tenantId: number,
  recruiterUserId: number,
  input: {
    roleId: string;
    cityId: string;
    experienceLevelId?: string | null;
    name: string;
    hiringCount: number;
    joiningTimelineDays?: number | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    shiftType?: string | null;
    genderPreference?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
    status?: string;
    sourceIds?: Array<{ sourceId: string; priority?: number; allocatedTarget?: number | null }>;
  },
  createdBy: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sourcing_campaign (
         tenant_id, recruiter_user_id, role_id, city_id, experience_level_id, name, hiring_count,
         joining_timeline_days, salary_min, salary_max, shift_type, gender_preference,
         start_date, end_date, notes, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        tenantId,
        recruiterUserId,
        input.roleId,
        input.cityId,
        input.experienceLevelId ?? null,
        input.name,
        input.hiringCount,
        input.joiningTimelineDays ?? null,
        input.salaryMin ?? null,
        input.salaryMax ?? null,
        input.shiftType ?? null,
        input.genderPreference ?? 'ANY',
        input.startDate ?? null,
        input.endDate ?? null,
        input.notes ?? null,
        input.status ?? 'ACTIVE',
        createdBy,
      ]
    );
    const campaignId = String(rows[0].id);
    for (const [i, src] of (input.sourceIds || []).entries()) {
      await client.query(
        `INSERT INTO campaign_source (tenant_id, campaign_id, source_id, priority, allocated_target, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, campaignId, src.sourceId, src.priority ?? i + 1, src.allocatedTarget ?? null, createdBy]
      );
    }
    await client.query('COMMIT');
    return getCampaignById(tenantId, campaignId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCampaign(
  tenantId: number,
  id: string,
  input: Record<string, unknown>
) {
  const existing = await getCampaignById(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) throw new VersionConflictError();

  const sets = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];
  const map: Record<string, string> = {
    roleId: 'role_id',
    cityId: 'city_id',
    experienceLevelId: 'experience_level_id',
    name: 'name',
    hiringCount: 'hiring_count',
    joiningTimelineDays: 'joining_timeline_days',
    salaryMin: 'salary_min',
    salaryMax: 'salary_max',
    shiftType: 'shift_type',
    genderPreference: 'gender_preference',
    startDate: 'start_date',
    endDate: 'end_date',
    notes: 'notes',
    status: 'status',
  };
  for (const [key, col] of Object.entries(map)) {
    if (input[key] !== undefined) {
      params.push(input[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  await pool.query(`UPDATE sourcing_campaign SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2`, params);
  return getCampaignById(tenantId, id);
}

export async function attachCampaignSource(
  tenantId: number,
  campaignId: string,
  input: { sourceId: string; priority?: number; allocatedTarget?: number | null; notes?: string | null },
  createdBy: string
) {
  const campaign = await getCampaignById(tenantId, campaignId);
  if (!campaign) return null;
  await pool.query(
    `INSERT INTO campaign_source (tenant_id, campaign_id, source_id, priority, allocated_target, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (campaign_id, source_id) DO UPDATE SET
       priority = EXCLUDED.priority,
       allocated_target = EXCLUDED.allocated_target,
       notes = EXCLUDED.notes,
       status = 'ACTIVE',
       modified_date = NOW(),
       version = campaign_source.version + 1`,
    [
      tenantId,
      campaignId,
      input.sourceId,
      input.priority ?? 1,
      input.allocatedTarget ?? null,
      input.notes ?? null,
      createdBy,
    ]
  );
  return getCampaignById(tenantId, campaignId);
}

export async function detachCampaignSource(tenantId: number, campaignId: string, sourceId: string) {
  const { rowCount } = await pool.query(
    `UPDATE campaign_source SET status = 'ARCHIVED', modified_date = NOW(), version = version + 1
     WHERE tenant_id = $1 AND campaign_id = $2 AND source_id = $3`,
    [tenantId, campaignId, sourceId]
  );
  return (rowCount ?? 0) > 0;
}
