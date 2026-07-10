-- =============================================================================
-- HarmiRecruit — safe Cloud SQL migration (idempotent)
-- =============================================================================
-- Database : harmoviajobs_courses_db  (Cloud SQL instance: harmoviajobs-db-us1)
-- Schema   : harmirecruit
-- Safe     : run multiple times; no seed/demo data; no DROP TABLE
--
-- How to run (pick one):
--
--   A) Cloud SQL Studio (GCP Console → SQL → harmoviajobs-db-us1 → Studio)
--      Paste this file and execute.
--
--   B) Local via Cloud SQL Auth Proxy:
--      cloud-sql-proxy harmoviajobs:us-central1:harmoviajobs-db-us1 &
--      psql "postgresql://app_user:YOUR_PASSWORD@127.0.0.1:5432/harmoviajobs_courses_db" \
--        -v ON_ERROR_STOP=1 -f scripts/cloud-migrate.sql
--
--   C) gcloud sql connect:
--      gcloud sql connect harmoviajobs-db-us1 --user=app_user --project=harmoviajobs
--      \i scripts/cloud-migrate.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema + search path
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS harmirecruit;
SET search_path TO harmirecruit, public;

-- ---------------------------------------------------------------------------
-- 2. Core tables (CREATE IF NOT EXISTS — no data touched)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'active',
  primary_color TEXT NOT NULL DEFAULT '#2563EB',
  logo_initials TEXT NOT NULL DEFAULT 'AI',
  features JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'recruiter',
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  client TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_to INTEGER REFERENCES users(id),
  open_positions INTEGER DEFAULT 1,
  description TEXT,
  tenure_days INTEGER,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  skills JSONB NOT NULL DEFAULT '[]',
  experience_years REAL DEFAULT 0,
  ai_score REAL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'applied',
  job_id INTEGER REFERENCES jobs(id),
  recruiter_id INTEGER REFERENCES users(id),
  notes TEXT,
  salary_expectation TEXT,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interviews (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  round_type TEXT DEFAULT 'Technical',
  status TEXT NOT NULL DEFAULT 'pending',
  meeting_link TEXT,
  notes TEXT,
  score REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  is_outgoing BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  candidate_id INTEGER REFERENCES candidates(id),
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id),
  due_at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL DEFAULT 'call',
  status TEXT NOT NULL DEFAULT 'upcoming',
  notes TEXT,
  ai_suggestion TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Column migrations (ADD IF NOT EXISTS — safe on existing DBs)
-- ---------------------------------------------------------------------------

-- Multi-tenant columns
ALTER TABLE users      ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE jobs       ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;

-- User profile / org
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata';
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_signature TEXT;

-- Candidate fields
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hm_notes TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_hot BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening JSONB;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS expected_joining_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offer_status TEXT;

-- Job tenure (drives post-joining check-in schedule)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tenure_days INTEGER;

-- Follow-up engine metadata
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS interview_id INTEGER REFERENCES interviews(id) ON DELETE CASCADE;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS milestone_day INTEGER;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES follow_ups(id) ON DELETE SET NULL;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE;

-- Interviews
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS evaluation JSONB;

-- ---------------------------------------------------------------------------
-- 4. Legacy settings table → tenant-scoped (only if old shape detected)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  default_tenant_id INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'harmirecruit' AND table_name = 'settings'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'harmirecruit' AND table_name = 'settings' AND column_name = 'tenant_id'
  ) THEN
    SELECT id INTO default_tenant_id FROM harmirecruit.tenants WHERE slug = 'staffpro-agency' LIMIT 1;
    IF default_tenant_id IS NULL THEN
      SELECT id INTO default_tenant_id FROM harmirecruit.tenants ORDER BY id LIMIT 1;
    END IF;

    CREATE TABLE harmirecruit.settings_new (
      tenant_id INTEGER NOT NULL REFERENCES harmirecruit.tenants(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      PRIMARY KEY (tenant_id, key)
    );

    IF default_tenant_id IS NOT NULL THEN
      INSERT INTO harmirecruit.settings_new (tenant_id, key, value)
      SELECT default_tenant_id, key, value FROM harmirecruit.settings;
    END IF;

    DROP TABLE harmirecruit.settings;
    ALTER TABLE harmirecruit.settings_new RENAME TO settings;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Indexes & constraints (IF NOT EXISTS / safe drops)
-- ---------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx
  ON users (tenant_id, email) WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_platform_email_idx
  ON users (email) WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_title_idx
  ON jobs (tenant_id, title);

CREATE INDEX IF NOT EXISTS follow_ups_rule_idx
  ON follow_ups (tenant_id, candidate_id, category);

CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_interview_rule_uidx
  ON follow_ups (tenant_id, interview_id, category)
  WHERE interview_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_onboarding_uidx
  ON follow_ups (tenant_id, candidate_id, milestone_day)
  WHERE category = 'onboarding' AND milestone_day IS NOT NULL;

DROP INDEX IF EXISTS follow_ups_offer_open_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_offer_milestone_uidx
  ON follow_ups (tenant_id, candidate_id, milestone_day)
  WHERE category = 'offer_followup' AND milestone_day IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_offer_chase_uidx
  ON follow_ups (tenant_id, candidate_id)
  WHERE category = 'offer_followup'
    AND milestone_day IS NULL
    AND completed_at IS NULL
    AND status NOT IN ('completed', 'missed');

-- ---------------------------------------------------------------------------
-- 6. Data backfills (non-destructive UPDATEs only)
-- ---------------------------------------------------------------------------

-- Backfill joined_at for legacy joined candidates
UPDATE candidates
SET joined_at = updated_at
WHERE stage = 'joined' AND joined_at IS NULL;

-- Backfill interview.created_by from matching activity rows
UPDATE interviews i
SET created_by = a.user_id
FROM activities a
WHERE i.created_by IS NULL
  AND a.candidate_id = i.candidate_id
  AND a.type = 'interview'
  AND a.user_id IS NOT NULL
  AND a.created_at BETWEEN i.created_at - INTERVAL '30 seconds' AND i.created_at + INTERVAL '30 seconds';

-- Move candidates with active interviews to interview stage
UPDATE candidates c
SET stage = 'interview', updated_at = NOW()
WHERE c.stage IN ('applied', 'screening')
  AND EXISTS (
    SELECT 1 FROM interviews i
    WHERE i.candidate_id = c.id
      AND i.status IN ('pending', 'confirmed')
  );

-- Assign orphan rows to default tenant (only where tenant_id is NULL)
DO $$
DECLARE
  default_tenant_id INTEGER;
BEGIN
  SELECT id INTO default_tenant_id FROM tenants WHERE slug = 'staffpro-agency' LIMIT 1;
  IF default_tenant_id IS NOT NULL THEN
    UPDATE users      SET tenant_id = default_tenant_id WHERE tenant_id IS NULL AND role != 'super_admin';
    UPDATE jobs       SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE candidates SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE activities SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Dedupe rule-generated follow-ups (removes duplicates only, keeps oldest)
-- ---------------------------------------------------------------------------
DELETE FROM follow_ups a
USING follow_ups b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.interview_id IS NOT NULL
  AND a.interview_id = b.interview_id
  AND a.category = b.category;

DELETE FROM follow_ups a
USING follow_ups b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.category = 'onboarding'
  AND b.category = 'onboarding'
  AND a.candidate_id = b.candidate_id
  AND a.milestone_day = b.milestone_day;

DELETE FROM follow_ups a
USING follow_ups b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.category = 'offer_followup'
  AND b.category = 'offer_followup'
  AND a.candidate_id = b.candidate_id
  AND a.milestone_day IS NULL
  AND b.milestone_day IS NULL
  AND a.completed_at IS NULL
  AND b.completed_at IS NULL
  AND a.status NOT IN ('completed', 'missed')
  AND b.status NOT IN ('completed', 'missed');

DELETE FROM follow_ups a
USING follow_ups b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.category = 'offer_followup'
  AND b.category = 'offer_followup'
  AND a.candidate_id = b.candidate_id
  AND a.milestone_day IS NOT NULL
  AND a.milestone_day = b.milestone_day;

-- Dedupe jobs (same tenant + title) — re-point candidates, then remove dupes
WITH ranked AS (
  SELECT id, MIN(id) OVER (PARTITION BY tenant_id, title) AS keep_id
  FROM jobs
)
UPDATE candidates c
SET job_id = r.keep_id
FROM ranked r
WHERE c.job_id = r.id AND r.id != r.keep_id;

DELETE FROM jobs j
USING (
  SELECT tenant_id, title, MIN(id) AS keep_id
  FROM jobs
  GROUP BY tenant_id, title
  HAVING COUNT(*) > 1
) d
WHERE j.tenant_id = d.tenant_id AND j.title = d.title AND j.id != d.keep_id;

COMMIT;

-- ---------------------------------------------------------------------------
-- Optional: grants (run as postgres / cloudsqlsuperuser — skip if already set)
-- ---------------------------------------------------------------------------
-- GRANT USAGE ON SCHEMA harmirecruit TO app_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA harmirecruit TO app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA harmirecruit TO app_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA harmirecruit GRANT ALL ON TABLES TO app_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA harmirecruit GRANT ALL ON SEQUENCES TO app_user;

-- ---------------------------------------------------------------------------
-- 8. Verification (read-only — run after COMMIT)
-- ---------------------------------------------------------------------------
SET search_path TO harmirecruit, public;

SELECT 'schema' AS check_item, current_schema() AS value;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'harmirecruit'
  AND table_name = 'candidates'
  AND column_name IN ('screening', 'joined_at', 'expected_joining_at', 'offer_status', 'is_hot')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'harmirecruit'
  AND table_name = 'users'
  AND column_name = 'wa_signature';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'harmirecruit'
  AND table_name = 'jobs'
  AND column_name = 'tenure_days';

SELECT
  (SELECT COUNT(*) FROM tenants)     AS tenants,
  (SELECT COUNT(*) FROM users)       AS users,
  (SELECT COUNT(*) FROM candidates)  AS candidates,
  (SELECT COUNT(*) FROM jobs)        AS jobs,
  (SELECT COUNT(*) FROM follow_ups)  AS follow_ups;
