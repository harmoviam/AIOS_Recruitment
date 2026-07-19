import type pg from 'pg';

/**
 * Idempotent Mohali Voice Process seed for a tenant (Sprint 4).
 * Safe to re-run: upserts masters and only inserts missing sources.
 */
export async function seedMohaliSourcingPack(client: pg.PoolClient, tenantId: number): Promise<void> {
  const country = await client.query(
    `INSERT INTO sourcing_country (tenant_id, code, name, phone_code, created_by)
     VALUES ($1, 'IN', 'India', '+91', 'seed')
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [tenantId]
  );
  const countryId = country.rows[0].id;

  const state = await client.query(
    `INSERT INTO sourcing_state (tenant_id, country_id, code, name, created_by)
     VALUES ($1, $2, 'PB', 'Punjab', 'seed')
     ON CONFLICT (tenant_id, country_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [tenantId, countryId]
  );
  const stateId = state.rows[0].id;

  let cityId: string;
  const existingCity = await client.query(
    `SELECT id FROM sourcing_city WHERE tenant_id = $1 AND state_id = $2 AND name = 'Mohali' LIMIT 1`,
    [tenantId, stateId]
  );
  if (existingCity.rows[0]) {
    cityId = existingCity.rows[0].id;
    await client.query(
      `UPDATE sourcing_city SET
         population = COALESCE(population, 200000),
         freshers_availability = COALESCE(freshers_availability, 78),
         bpo_companies = COALESCE(bpo_companies, 140),
         night_shift_acceptance = COALESCE(night_shift_acceptance, 85),
         language_availability = CASE
           WHEN language_availability = '[]'::jsonb THEN $2::jsonb
           ELSE language_availability END,
         modified_date = NOW()
       WHERE id = $1`,
      [cityId, JSON.stringify(['English', 'Hindi', 'Punjabi'])]
    );
  } else {
    const city = await client.query(
      `INSERT INTO sourcing_city (
         tenant_id, state_id, name, latitude, longitude, population, freshers_availability,
         engineering_colleges, degree_colleges, mba_colleges, training_institutes,
         spoken_english_institutes, bpo_companies, it_companies, average_salary,
         language_availability, night_shift_acceptance, women_workforce_pct, migration_pct,
         public_transport_score, cost_of_living_index, hiring_difficulty, created_by
       ) VALUES (
         $1,$2,'Mohali',30.7046,76.7179,200000,78,
         12,25,4,18,
         22,140,90,22000,
         $3::jsonb,85,35,40,
         70,65,45,'seed'
       ) RETURNING id`,
      [tenantId, stateId, JSON.stringify(['English', 'Hindi', 'Punjabi'])]
    );
    cityId = city.rows[0].id;
  }

  const industry = await client.query(
    `INSERT INTO sourcing_industry (tenant_id, code, name, description, created_by)
     VALUES ($1, 'BPO', 'BPO / BPM', 'Business process outsourcing', 'seed')
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [tenantId]
  );
  const category = await client.query(
    `INSERT INTO recruitment_category (tenant_id, code, name, created_by)
     VALUES ($1, 'VOICE', 'Voice Process', 'seed')
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [tenantId]
  );
  const role = await client.query(
    `INSERT INTO sourcing_role (tenant_id, industry_id, recruitment_category_id, code, name, aliases, created_by)
     VALUES ($1,$2,$3,'INTL_VOICE','International Voice Process',$4::jsonb,'seed')
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [tenantId, industry.rows[0].id, category.rows[0].id, JSON.stringify(['Voice Process', 'International Voice'])]
  );
  const roleId = role.rows[0].id;

  const exp = await client.query(
    `INSERT INTO experience_level (tenant_id, code, name, min_years, max_years, rank_order, created_by)
     VALUES ($1,'FRESHER','Fresher',0,1,1,'seed')
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [tenantId]
  );

  const cats = [
    ['FACEBOOK', 'Facebook Groups'],
    ['WHATSAPP', 'WhatsApp Communities'],
    ['JOB_PORTAL', 'Job Portals'],
    ['COLLEGE', 'Colleges'],
    ['REFERRAL', 'Employee Referral'],
  ];
  const catIds: Record<string, string> = {};
  for (const [code, name] of cats) {
    const { rows } = await client.query(
      `INSERT INTO source_category (tenant_id, code, name, created_by)
       VALUES ($1,$2,$3,'seed')
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tenantId, code, name]
    );
    catIds[code] = rows[0].id;
  }

  const sources = [
    {
      name: 'Mohali Voice Jobs Facebook Group',
      channel: 'FACEBOOK',
      cat: 'FACEBOOK',
      members: 42000,
      dam: 1200,
      quality: 8.2,
      response: 55,
      pool: 3500,
    },
    {
      name: 'Mohali BPO WhatsApp Community',
      channel: 'WHATSAPP',
      cat: 'WHATSAPP',
      members: 800,
      dam: 350,
      quality: 7.5,
      response: 70,
      pool: 900,
    },
    {
      name: 'Naukri — Voice Process Mohali',
      channel: 'JOB_PORTAL',
      cat: 'JOB_PORTAL',
      members: null,
      dam: 200,
      quality: 7.8,
      response: 40,
      pool: 2500,
    },
    {
      name: 'C-DAC / Local Degree College Drives',
      channel: 'COLLEGE',
      cat: 'COLLEGE',
      members: null,
      dam: 80,
      quality: 6.5,
      response: 45,
      pool: 600,
    },
    {
      name: 'Employee Referral — Voice Floor',
      channel: 'REFERRAL',
      cat: 'REFERRAL',
      members: null,
      dam: 40,
      quality: 8.8,
      response: 75,
      pool: 400,
    },
  ];

  for (const s of sources) {
    const existing = await client.query(
      `SELECT id FROM source WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
      [tenantId, s.name]
    );
    let sourceId: string;
    if (existing.rows[0]) {
      sourceId = existing.rows[0].id;
    } else {
      const { rows } = await client.query(
        `INSERT INTO source (
           tenant_id, source_category_id, city_id, state_id, name, channel_type,
           member_count, daily_active_members, quality_rating, response_rate,
           estimated_candidate_pool, last_verified, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_DATE,'seed')
         RETURNING id`,
        [
          tenantId,
          catIds[s.cat],
          cityId,
          stateId,
          s.name,
          s.channel,
          s.members,
          s.dam,
          s.quality,
          s.response,
          s.pool,
        ]
      );
      sourceId = rows[0].id;
    }
    await client.query(
      `INSERT INTO source_role (tenant_id, source_id, role_id, created_by) VALUES ($1,$2,$3,'seed')
       ON CONFLICT (source_id, role_id) DO NOTHING`,
      [tenantId, sourceId, roleId]
    );
    await client.query(
      `INSERT INTO source_experience_level (tenant_id, source_id, experience_level_id, created_by)
       VALUES ($1,$2,$3,'seed') ON CONFLICT (source_id, experience_level_id) DO NOTHING`,
      [tenantId, sourceId, exp.rows[0].id]
    );
    for (const [code, name] of [
      ['en', 'English'],
      ['hi', 'Hindi'],
      ['pa', 'Punjabi'],
    ]) {
      await client.query(
        `INSERT INTO source_language (tenant_id, source_id, language_code, language_name, created_by)
         VALUES ($1,$2,$3,$4,'seed') ON CONFLICT (source_id, language_code) DO NOTHING`,
        [tenantId, sourceId, code, name]
      );
    }
  }
}
