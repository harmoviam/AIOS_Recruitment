-- =============================================================================
-- HarmiRecruit — Mohali Voice Process sourcing seed (prod)
-- SQL mirror of server/src/services/sourcing/seed/mohaliSeed.ts, which only
-- runs automatically when NODE_ENV != 'production'.
-- Idempotent: upserts masters, only inserts missing city/sources.
-- Run against: harmoviajobs_courses_db, schema harmirecruit.
-- =============================================================================

SET search_path TO harmirecruit, public;

DO $$
DECLARE
  t RECORD;
  src RECORD;
  lang RECORD;
  v_country_id UUID;
  v_state_id UUID;
  v_city_id UUID;
  v_industry_id UUID;
  v_category_id UUID;
  v_role_id UUID;
  v_exp_id UUID;
  v_source_cat_id UUID;
  v_source_id UUID;
BEGIN
  FOR t IN SELECT id FROM tenants WHERE status != 'churned' LOOP

    -- ---------------------------------------------------------------- geo
    INSERT INTO sourcing_country (tenant_id, code, name, phone_code, created_by)
    VALUES (t.id, 'IN', 'India', '+91', 'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_country_id;

    INSERT INTO sourcing_state (tenant_id, country_id, code, name, created_by)
    VALUES (t.id, v_country_id, 'PB', 'Punjab', 'seed')
    ON CONFLICT (tenant_id, country_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_state_id;

    SELECT id INTO v_city_id FROM sourcing_city
    WHERE tenant_id = t.id AND state_id = v_state_id AND name = 'Mohali' LIMIT 1;

    IF v_city_id IS NOT NULL THEN
      UPDATE sourcing_city SET
        population = COALESCE(population, 200000),
        freshers_availability = COALESCE(freshers_availability, 78),
        bpo_companies = COALESCE(bpo_companies, 140),
        night_shift_acceptance = COALESCE(night_shift_acceptance, 85),
        language_availability = CASE
          WHEN language_availability = '[]'::jsonb
          THEN '["English","Hindi","Punjabi"]'::jsonb
          ELSE language_availability END,
        modified_date = NOW()
      WHERE id = v_city_id;
    ELSE
      INSERT INTO sourcing_city (
        tenant_id, state_id, name, latitude, longitude, population, freshers_availability,
        engineering_colleges, degree_colleges, mba_colleges, training_institutes,
        spoken_english_institutes, bpo_companies, it_companies, average_salary,
        language_availability, night_shift_acceptance, women_workforce_pct, migration_pct,
        public_transport_score, cost_of_living_index, hiring_difficulty, created_by
      ) VALUES (
        t.id, v_state_id, 'Mohali', 30.7046, 76.7179, 200000, 78,
        12, 25, 4, 18,
        22, 140, 90, 22000,
        '["English","Hindi","Punjabi"]'::jsonb, 85, 35, 40,
        70, 65, 45, 'seed'
      ) RETURNING id INTO v_city_id;
    END IF;

    -- ------------------------------------------------------- talent masters
    INSERT INTO sourcing_industry (tenant_id, code, name, description, created_by)
    VALUES (t.id, 'BPO', 'BPO / BPM', 'Business process outsourcing', 'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_industry_id;

    INSERT INTO recruitment_category (tenant_id, code, name, created_by)
    VALUES (t.id, 'VOICE', 'Voice Process', 'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_category_id;

    INSERT INTO sourcing_role (tenant_id, industry_id, recruitment_category_id, code, name, aliases, created_by)
    VALUES (t.id, v_industry_id, v_category_id, 'INTL_VOICE', 'International Voice Process',
            '["Voice Process","International Voice"]'::jsonb, 'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_role_id;

    INSERT INTO experience_level (tenant_id, code, name, min_years, max_years, rank_order, created_by)
    VALUES (t.id, 'FRESHER', 'Fresher', 0, 1, 1, 'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_exp_id;

    -- ----------------------------------------------------- source categories
    INSERT INTO source_category (tenant_id, code, name, created_by)
    VALUES
      (t.id, 'FACEBOOK',   'Facebook Groups',      'seed'),
      (t.id, 'WHATSAPP',   'WhatsApp Communities', 'seed'),
      (t.id, 'JOB_PORTAL', 'Job Portals',          'seed'),
      (t.id, 'COLLEGE',    'Colleges',             'seed'),
      (t.id, 'REFERRAL',   'Employee Referral',    'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

    -- ---------------------------------------------------------------- sources
    FOR src IN
      SELECT * FROM (VALUES
        ('Mohali Voice Jobs Facebook Group',    'FACEBOOK',   'FACEBOOK',   42000,   1200, 8.2, 55, 3500),
        ('Mohali BPO WhatsApp Community',       'WHATSAPP',   'WHATSAPP',   800,     350,  7.5, 70, 900),
        ('Naukri — Voice Process Mohali',       'JOB_PORTAL', 'JOB_PORTAL', NULL,    200,  7.8, 40, 2500),
        ('C-DAC / Local Degree College Drives', 'COLLEGE',    'COLLEGE',    NULL,    80,   6.5, 45, 600),
        ('Employee Referral — Voice Floor',     'REFERRAL',   'REFERRAL',   NULL,    40,   8.8, 75, 400)
      ) AS s(name, channel, cat, members, dam, quality, response, pool)
    LOOP
      SELECT id INTO v_source_cat_id FROM source_category
      WHERE tenant_id = t.id AND code = src.cat;

      SELECT id INTO v_source_id FROM source
      WHERE tenant_id = t.id AND name = src.name LIMIT 1;

      IF v_source_id IS NULL THEN
        INSERT INTO source (
          tenant_id, source_category_id, city_id, state_id, name, channel_type,
          member_count, daily_active_members, quality_rating, response_rate,
          estimated_candidate_pool, last_verified, created_by
        ) VALUES (
          t.id, v_source_cat_id, v_city_id, v_state_id, src.name, src.channel,
          src.members, src.dam, src.quality, src.response,
          src.pool, CURRENT_DATE, 'seed'
        ) RETURNING id INTO v_source_id;
      END IF;

      INSERT INTO source_role (tenant_id, source_id, role_id, created_by)
      VALUES (t.id, v_source_id, v_role_id, 'seed')
      ON CONFLICT (source_id, role_id) DO NOTHING;

      INSERT INTO source_experience_level (tenant_id, source_id, experience_level_id, created_by)
      VALUES (t.id, v_source_id, v_exp_id, 'seed')
      ON CONFLICT (source_id, experience_level_id) DO NOTHING;

      FOR lang IN
        SELECT * FROM (VALUES
          ('en', 'English'), ('hi', 'Hindi'), ('pa', 'Punjabi')
        ) AS l(code, name)
      LOOP
        INSERT INTO source_language (tenant_id, source_id, language_code, language_name, created_by)
        VALUES (t.id, v_source_id, lang.code, lang.name, 'seed')
        ON CONFLICT (source_id, language_code) DO NOTHING;
      END LOOP;
    END LOOP;

  END LOOP;
END $$;

-- Verify:
SELECT c.tenant_id, c.name AS city, r.name AS role,
       (SELECT COUNT(*) FROM source s WHERE s.tenant_id = c.tenant_id AND s.city_id = c.id) AS sources
FROM sourcing_city c
JOIN sourcing_role r ON r.tenant_id = c.tenant_id AND r.code = 'INTL_VOICE'
WHERE c.name = 'Mohali'
ORDER BY c.tenant_id;
