-- HarmiRecruit: Company geo for nearby-company ranking
-- Run against the harmirecruit schema (see DB_SCHEMA in .env)

ALTER TABLE companies ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS longitude REAL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pincode TEXT;

CREATE INDEX IF NOT EXISTS companies_geo_tenant_idx
  ON companies (tenant_id, status)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
