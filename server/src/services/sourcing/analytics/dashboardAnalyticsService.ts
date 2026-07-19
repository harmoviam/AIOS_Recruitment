import { pool } from '../../../db.js';

export async function getDashboardSummary(tenantId: number) {
  const [sources, cities, campaigns, funnel] = await Promise.all([
    pool.query(
      `SELECT s.id, s.name, COALESCE(sp.success_score, 0) AS score, COALESCE(sp.joinings, 0) AS joinings
       FROM source s
       LEFT JOIN LATERAL (
         SELECT success_score, joinings FROM source_performance p
         WHERE p.source_id = s.id AND p.tenant_id = s.tenant_id AND p.status = 'ACTIVE'
         ORDER BY p.modified_date DESC LIMIT 1
       ) sp ON TRUE
       WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
       ORDER BY score DESC, joinings DESC
       LIMIT 5`,
      [tenantId]
    ),
    pool.query(
      `SELECT c.id, c.name, COUNT(s.id)::int AS source_count
       FROM sourcing_city c
       LEFT JOIN source s ON s.city_id = c.id AND s.status = 'ACTIVE'
       WHERE c.tenant_id = $1 AND c.status = 'ACTIVE'
       GROUP BY c.id, c.name
       ORDER BY source_count DESC
       LIMIT 5`,
      [tenantId]
    ),
    pool.query(
      `SELECT id, name, hiring_count, status, created_date
       FROM sourcing_campaign
       WHERE tenant_id = $1
       ORDER BY created_date DESC
       LIMIT 5`,
      [tenantId]
    ),
    pool.query(
      `SELECT
         COALESCE(SUM(applications),0)::int AS applications,
         COALESCE(SUM(interviews),0)::int AS interviews,
         COALESCE(SUM(joinings),0)::int AS joinings
       FROM sourcing_recruiter_activity
       WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId]
    ),
  ]);

  const apps = funnel.rows[0].applications as number;
  const interviews = funnel.rows[0].interviews as number;
  const joinings = funnel.rows[0].joinings as number;

  return {
    topSources: sources.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      score: Number(r.score),
      joinings: Number(r.joinings),
    })),
    topCities: cities.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      sourceCount: Number(r.source_count),
    })),
    topCampaigns: campaigns.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      hiringCount: Number(r.hiring_count),
      status: String(r.status),
    })),
    applications: apps,
    interviews,
    joinings,
    conversionPct: apps > 0 ? Number(((joinings / apps) * 100).toFixed(1)) : 0,
  };
}

export async function getSourcePerformanceChart(tenantId: number) {
  const { rows } = await pool.query(
    `SELECT s.name, COALESCE(SUM(a.applications),0)::int AS applications,
            COALESCE(SUM(a.interviews),0)::int AS interviews,
            COALESCE(SUM(a.joinings),0)::int AS joinings
     FROM source s
     LEFT JOIN sourcing_recruiter_activity a ON a.source_id = s.id AND a.status = 'ACTIVE'
     WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
     GROUP BY s.id, s.name
     ORDER BY applications DESC
     LIMIT 10`,
    [tenantId]
  );
  return {
    categories: rows.map((r) => String(r.name)),
    series: [
      { name: 'Applications', data: rows.map((r) => Number(r.applications)) },
      { name: 'Interviews', data: rows.map((r) => Number(r.interviews)) },
      { name: 'Joinings', data: rows.map((r) => Number(r.joinings)) },
    ],
  };
}

export async function getCityDistributionChart(tenantId: number) {
  const { rows } = await pool.query(
    `SELECT c.name, COUNT(s.id)::int AS value
     FROM sourcing_city c
     LEFT JOIN source s ON s.city_id = c.id AND s.status = 'ACTIVE'
     WHERE c.tenant_id = $1 AND c.status = 'ACTIVE'
     GROUP BY c.id, c.name
     HAVING COUNT(s.id) > 0
     ORDER BY value DESC
     LIMIT 8`,
    [tenantId]
  );
  return rows.map((r) => ({ name: String(r.name), value: Number(r.value) }));
}

export async function getRoleDistributionChart(tenantId: number) {
  const { rows } = await pool.query(
    `SELECT r.name, COUNT(sr.source_id)::int AS value
     FROM sourcing_role r
     LEFT JOIN source_role sr ON sr.role_id = r.id AND sr.status = 'ACTIVE'
     WHERE r.tenant_id = $1 AND r.status = 'ACTIVE'
     GROUP BY r.id, r.name
     HAVING COUNT(sr.source_id) > 0
     ORDER BY value DESC
     LIMIT 8`,
    [tenantId]
  );
  return rows.map((r) => ({ name: String(r.name), value: Number(r.value) }));
}

export async function getCampaignPerformanceChart(tenantId: number) {
  const { rows } = await pool.query(
    `SELECT c.name,
            COALESCE(SUM(a.applications),0)::int AS applications,
            COALESCE(SUM(a.joinings),0)::int AS joinings
     FROM sourcing_campaign c
     LEFT JOIN sourcing_recruiter_activity a ON a.campaign_id = c.id AND a.status = 'ACTIVE'
     WHERE c.tenant_id = $1
     GROUP BY c.id, c.name
     ORDER BY c.created_date DESC
     LIMIT 8`,
    [tenantId]
  );
  return {
    categories: rows.map((r) => String(r.name)),
    series: [
      { name: 'Applications', data: rows.map((r) => Number(r.applications)) },
      { name: 'Joinings', data: rows.map((r) => Number(r.joinings)) },
    ],
  };
}
