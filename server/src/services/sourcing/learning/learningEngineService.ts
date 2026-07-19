import { pool } from '../../../db.js';

export interface ActivityInput {
  sourceId: string;
  campaignId?: string | null;
  cityId?: string | null;
  roleId?: string | null;
  activityDate?: string;
  applications?: number;
  interviews?: number;
  offers?: number;
  joinings?: number;
  noShows?: number;
  offerDrops?: number;
  notes?: string | null;
}

function computeSuccessScore(row: {
  applications: number;
  interviews: number;
  offers: number;
  joinings: number;
  noShows: number;
  offerDrops: number;
}): { successScore: number; pastSuccessRate: number } {
  const apps = Math.max(row.applications, 1);
  const interviewRate = row.interviews / apps;
  const offerRate = row.offers / Math.max(row.interviews, 1);
  const joinRate = row.joinings / Math.max(row.offers, 1);
  const penalty = (row.noShows + row.offerDrops) / Math.max(row.interviews + row.offers, 1);
  const successScore = Math.max(
    0,
    Math.min(100, (interviewRate * 25 + offerRate * 30 + joinRate * 45 - penalty * 20) * 100)
  );
  const pastSuccessRate = Math.max(0, Math.min(100, (row.joinings / apps) * 100));
  return { successScore: Number(successScore.toFixed(3)), pastSuccessRate: Number(pastSuccessRate.toFixed(3)) };
}

export async function recordActivity(
  tenantId: number,
  recruiterUserId: number,
  input: ActivityInput,
  createdBy: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sourcing_recruiter_activity (
         tenant_id, recruiter_user_id, source_id, campaign_id, city_id, role_id, activity_date,
         applications, interviews, offers, joinings, no_shows, offer_drops, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        tenantId,
        recruiterUserId,
        input.sourceId,
        input.campaignId ?? null,
        input.cityId ?? null,
        input.roleId ?? null,
        input.activityDate ?? null,
        input.applications ?? 0,
        input.interviews ?? 0,
        input.offers ?? 0,
        input.joinings ?? 0,
        input.noShows ?? 0,
        input.offerDrops ?? 0,
        input.notes ?? null,
        createdBy,
      ]
    );

    await recomputeSourceScore(client, tenantId, input.sourceId, input.cityId, input.roleId, createdBy);
    await client.query('COMMIT');
    const r = rows[0];
    return {
      id: String(r.id),
      sourceId: String(r.source_id),
      applications: Number(r.applications),
      interviews: Number(r.interviews),
      offers: Number(r.offers),
      joinings: Number(r.joinings),
      noShows: Number(r.no_shows),
      offerDrops: Number(r.offer_drops),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function recomputeSourceScore(
  client: { query: typeof pool.query },
  tenantId: number,
  sourceId: string,
  cityId?: string | null,
  roleId?: string | null,
  createdBy?: string
) {
  const { rows } = await client.query(
    `SELECT
       COALESCE(SUM(applications),0)::int AS applications,
       COALESCE(SUM(interviews),0)::int AS interviews,
       COALESCE(SUM(offers),0)::int AS offers,
       COALESCE(SUM(joinings),0)::int AS joinings,
       COALESCE(SUM(no_shows),0)::int AS no_shows,
       COALESCE(SUM(offer_drops),0)::int AS offer_drops
     FROM sourcing_recruiter_activity
     WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'
       AND ($3::uuid IS NULL OR city_id = $3 OR city_id IS NULL)
       AND ($4::uuid IS NULL OR role_id = $4 OR role_id IS NULL)`,
    [tenantId, sourceId, cityId ?? null, roleId ?? null]
  );
  const agg = {
    applications: Number(rows[0].applications),
    interviews: Number(rows[0].interviews),
    offers: Number(rows[0].offers),
    joinings: Number(rows[0].joinings),
    noShows: Number(rows[0].no_shows),
    offerDrops: Number(rows[0].offer_drops),
  };
  const { successScore, pastSuccessRate } = computeSuccessScore(agg);

  const existing = await client.query(
    `SELECT id FROM source_performance
     WHERE tenant_id = $1 AND source_id = $2
       AND city_id IS NOT DISTINCT FROM $3::uuid
       AND role_id IS NOT DISTINCT FROM $4::uuid
     LIMIT 1`,
    [tenantId, sourceId, cityId ?? null, roleId ?? null]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE source_performance SET
         applications = $2, interviews = $3, offers = $4, joinings = $5,
         no_shows = $6, offer_drops = $7, success_score = $8, past_success_rate = $9,
         modified_date = NOW(), version = version + 1
       WHERE id = $1`,
      [
        existing.rows[0].id,
        agg.applications,
        agg.interviews,
        agg.offers,
        agg.joinings,
        agg.noShows,
        agg.offerDrops,
        successScore,
        pastSuccessRate,
      ]
    );
  } else {
    await client.query(
      `INSERT INTO source_performance (
         tenant_id, source_id, city_id, role_id, applications, interviews, offers, joinings,
         no_shows, offer_drops, success_score, past_success_rate, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        tenantId,
        sourceId,
        cityId ?? null,
        roleId ?? null,
        agg.applications,
        agg.interviews,
        agg.offers,
        agg.joinings,
        agg.noShows,
        agg.offerDrops,
        successScore,
        pastSuccessRate,
        createdBy ?? null,
      ]
    );
  }

  return { successScore, pastSuccessRate, ...agg };
}

export async function recompute(tenantId: number, sourceId: string) {
  const client = await pool.connect();
  try {
    return await recomputeSourceScore(client, tenantId, sourceId);
  } finally {
    client.release();
  }
}

export async function getScores(tenantId: number, sourceId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM source_performance WHERE tenant_id = $1 AND source_id = $2 AND status = 'ACTIVE'
     ORDER BY modified_date DESC`,
    [tenantId, sourceId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    sourceId: String(r.source_id),
    cityId: r.city_id != null ? String(r.city_id) : null,
    roleId: r.role_id != null ? String(r.role_id) : null,
    applications: Number(r.applications),
    interviews: Number(r.interviews),
    offers: Number(r.offers),
    joinings: Number(r.joinings),
    noShows: Number(r.no_shows),
    offerDrops: Number(r.offer_drops),
    successScore: Number(r.success_score),
    pastSuccessRate: Number(r.past_success_rate),
  }));
}
