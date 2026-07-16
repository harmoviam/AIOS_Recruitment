-- HarmiRecruit: Job Recommendation Engine schema additions
-- Run against the harmirecruit schema (see DB_SCHEMA in .env)

-- Candidate matching profile
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS longitude REAL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS relocation_allowed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS highest_qualification TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS specialization TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_job_type TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_shift TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_cities JSONB DEFAULT '[]';

-- Job location & requirements (latitude/longitude mandatory for new jobs via API validation)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS longitude REAL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_qualification TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_languages JSONB DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_age INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_age INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_experience REAL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_experience REAL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_skills JSONB DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shift TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gender_preference TEXT;

CREATE INDEX IF NOT EXISTS jobs_active_tenant_idx
  ON jobs (tenant_id, status)
  WHERE status IN ('active', 'urgent', 'open');
