-- =============================================================================
-- HarmiRecruit — Bangalore / Noida / Kochi sourcing seed (prod)
-- Companion to seed-sourcing-mohali.sql; same idempotent pattern.
-- Adds three cities with their states, demographics, and five sourcing
-- channels each, linked to the International Voice Process role.
-- Run against: harmoviajobs_courses_db, schema harmirecruit.
-- =============================================================================

SET search_path TO harmirecruit, public;

DO $$
DECLARE
  t RECORD;
  city RECORD;
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

    -- ------------------------------------------------------- shared masters
    INSERT INTO sourcing_country (tenant_id, code, name, phone_code, created_by)
    VALUES (t.id, 'IN', 'India', '+91', 'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_country_id;

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

    INSERT INTO source_category (tenant_id, code, name, created_by)
    VALUES
      (t.id, 'FACEBOOK',   'Facebook Groups',      'seed'),
      (t.id, 'WHATSAPP',   'WhatsApp Communities', 'seed'),
      (t.id, 'JOB_PORTAL', 'Job Portals',          'seed'),
      (t.id, 'COLLEGE',    'Colleges',             'seed'),
      (t.id, 'REFERRAL',   'Employee Referral',    'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

    -- ---------------------------------------------------------------- cities
    FOR city IN
      SELECT * FROM (VALUES
        ('Bangalore', 'KA', 'Karnataka',
         12.9716, 77.5946, 8400000, 92,
         90, 250, 60, 400,
         150, 1200, 3500, 28000,
         '["English","Hindi","Kannada","Tamil","Telugu"]'::jsonb, 90, 42, 55,
         80, 95, 60),
        ('Noida', 'UP', 'Uttar Pradesh',
         28.5355, 77.3910, 650000, 85,
         25, 40, 15, 120,
         60, 450, 800, 25000,
         '["English","Hindi"]'::jsonb, 88, 35, 60,
         75, 80, 55),
        ('Kochi', 'KL', 'Kerala',
         9.9312, 76.2673, 680000, 80,
         20, 35, 10, 60,
         45, 120, 300, 23000,
         '["English","Malayalam","Hindi","Tamil"]'::jsonb, 70, 45, 30,
         72, 70, 50)
      ) AS c(name, state_code, state_name,
             lat, lon, population, freshers,
             eng_colleges, degree_colleges, mba_colleges, training_institutes,
             spoken_english, bpo_companies, it_companies, avg_salary,
             langs, night_shift, women_pct, migration_pct,
             transport, col_index, difficulty)
    LOOP
      INSERT INTO sourcing_state (tenant_id, country_id, code, name, created_by)
      VALUES (t.id, v_country_id, city.state_code, city.state_name, 'seed')
      ON CONFLICT (tenant_id, country_id, code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO v_state_id;

      SELECT id INTO v_city_id FROM sourcing_city
      WHERE tenant_id = t.id AND state_id = v_state_id AND name = city.name LIMIT 1;

      IF v_city_id IS NOT NULL THEN
        UPDATE sourcing_city SET
          population = COALESCE(population, city.population),
          freshers_availability = COALESCE(freshers_availability, city.freshers),
          bpo_companies = COALESCE(bpo_companies, city.bpo_companies),
          night_shift_acceptance = COALESCE(night_shift_acceptance, city.night_shift),
          language_availability = CASE
            WHEN language_availability = '[]'::jsonb THEN city.langs
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
          t.id, v_state_id, city.name, city.lat, city.lon, city.population, city.freshers,
          city.eng_colleges, city.degree_colleges, city.mba_colleges, city.training_institutes,
          city.spoken_english, city.bpo_companies, city.it_companies, city.avg_salary,
          city.langs, city.night_shift, city.women_pct, city.migration_pct,
          city.transport, city.col_index, city.difficulty, 'seed'
        ) RETURNING id INTO v_city_id;
      END IF;

      -- -------------------------------------------------------------- sources
      FOR src IN
        SELECT * FROM (VALUES
          -- Bangalore
          ('Bangalore', 'Bangalore Voice Jobs Facebook Group',         'FACEBOOK',   'FACEBOOK',   120000, 4500, 8.0, 50, 12000),
          ('Bangalore', 'Bangalore BPO WhatsApp Community',            'WHATSAPP',   'WHATSAPP',   1800,   700,  7.6, 68, 2200),
          ('Bangalore', 'Naukri — Voice Process Bangalore',            'JOB_PORTAL', 'JOB_PORTAL', NULL,   900,  8.0, 42, 9500),
          ('Bangalore', 'Bangalore Degree College Placement Drives',   'COLLEGE',    'COLLEGE',    NULL,   250,  6.8, 45, 2200),
          ('Bangalore', 'Employee Referral — Bangalore Voice Floor',   'REFERRAL',   'REFERRAL',   NULL,   120,  8.8, 75, 1300),
          -- Noida
          ('Noida',     'Noida Voice Jobs Facebook Group',             'FACEBOOK',   'FACEBOOK',   68000,  2400, 7.9, 52, 6500),
          ('Noida',     'Noida BPO WhatsApp Community',                'WHATSAPP',   'WHATSAPP',   1200,   480,  7.4, 69, 1400),
          ('Noida',     'Naukri — Voice Process Noida',                'JOB_PORTAL', 'JOB_PORTAL', NULL,   500,  7.9, 41, 5200),
          ('Noida',     'Noida / NCR College Placement Drives',        'COLLEGE',    'COLLEGE',    NULL,   150,  6.6, 44, 1300),
          ('Noida',     'Employee Referral — Noida Voice Floor',       'REFERRAL',   'REFERRAL',   NULL,   80,   8.7, 74, 800),
          -- Kochi
          ('Kochi',     'Kochi Voice Jobs Facebook Group',             'FACEBOOK',   'FACEBOOK',   30000,  900,  7.8, 54, 2800),
          ('Kochi',     'Kochi BPO WhatsApp Community',                'WHATSAPP',   'WHATSAPP',   700,    300,  7.4, 70, 800),
          ('Kochi',     'Naukri — Voice Process Kochi',                'JOB_PORTAL', 'JOB_PORTAL', NULL,   150,  7.7, 40, 2000),
          ('Kochi',     'Kochi Degree College Placement Drives',       'COLLEGE',    'COLLEGE',    NULL,   70,   6.6, 46, 500),
          ('Kochi',     'Employee Referral — Kochi Voice Floor',       'REFERRAL',   'REFERRAL',   NULL,   35,   8.7, 74, 350)
        ) AS s(city, name, channel, cat, members, dam, quality, response, pool)
        WHERE s.city = city.name
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
            ('Bangalore', 'en', 'English'),
            ('Bangalore', 'hi', 'Hindi'),
            ('Bangalore', 'kn', 'Kannada'),
            ('Noida',     'en', 'English'),
            ('Noida',     'hi', 'Hindi'),
            ('Kochi',     'en', 'English'),
            ('Kochi',     'ml', 'Malayalam'),
            ('Kochi',     'hi', 'Hindi')
          ) AS l(city, code, name)
          WHERE l.city = city.name
        LOOP
          INSERT INTO source_language (tenant_id, source_id, language_code, language_name, created_by)
          VALUES (t.id, v_source_id, lang.code, lang.name, 'seed')
          ON CONFLICT (source_id, language_code) DO NOTHING;
        END LOOP;
      END LOOP;

    END LOOP;
  END LOOP;
END $$;

-- Verify:
SELECT c.tenant_id, c.name AS city,
       (SELECT COUNT(*) FROM source s WHERE s.tenant_id = c.tenant_id AND s.city_id = c.id) AS sources
FROM sourcing_city c
WHERE c.name IN ('Bangalore', 'Noida', 'Kochi')
ORDER BY c.tenant_id, c.name;
