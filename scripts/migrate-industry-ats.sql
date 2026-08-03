-- =============================================================================
-- HarmiRecruit — Job sector + resume ATS score (idempotent)
-- =============================================================================
-- Adds:
--   jobs.industry        — sector of the opening (BPO, Information Technology, …)
--                          Distinct from jobs.job_type, which is the work mode
--                          (On-site / Remote / Hybrid) and is left untouched.
--   candidates.ats_score   — 0-100 resume quality / JD-match score
--   candidates.ats_details — full ATS breakdown (categories, gaps, fixes)
--                          Distinct from candidates.ai_score, the 0-10 role fit.
--
-- Safe: idempotent, additive only. No DROP, no data loss, no seed data.
--       Re-running it is a no-op.
--
-- NOTE: initDb() in server/src/db.ts runs these same ALTERs on every boot, so a
-- normal deploy self-migrates. Run this script when you want the columns in
-- place *before* the new revision starts serving traffic (recommended), or when
-- the deploy user lacks DDL rights at runtime.
--
-- TARGET (get this wrong and the guard below aborts the run):
--   Instance : harmoviajobs-db-us1
--   Database : harmoviajobs_courses_db      <-- NOT harmoviajobs_app_db
--   Schema   : harmirecruit                 <-- NOT public
--
-- The same instance also hosts harmoviajobs_app_db (HarmoviaCRM). Its public
-- schema has its own tables with overlapping names — do not run this there.
--
-- How to run (pick one):
--
--   A) Cloud SQL Studio (GCP Console → SQL → harmoviajobs-db-us1 → Studio)
--      Set the database selector to harmoviajobs_courses_db FIRST, then paste
--      this file and execute.
--
--   B) Local via Cloud SQL Auth Proxy:
--      cloud-sql-proxy harmoviajobs:us-central1:harmoviajobs-db-us1 &
--      psql "postgresql://app_user:YOUR_PASSWORD@127.0.0.1:5432/harmoviajobs_courses_db" \
--        -v ON_ERROR_STOP=1 -f scripts/migrate-industry-ats.sql
--
--   C) gcloud sql connect:
--      gcloud sql connect harmoviajobs-db-us1 --user=app_user --project=harmoviajobs
--      \i scripts/migrate-industry-ats.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guard — refuse to run against the wrong database or schema.
--
--     HarmiRecruit lives in database harmoviajobs_courses_db, schema
--     harmirecruit. The same Cloud SQL instance also hosts harmoviajobs_app_db
--     (HarmoviaCRM), which has its own similarly-named tables. Running this
--     there would silently alter the wrong application's data.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('harmirecruit.jobs') IS NULL
     OR to_regclass('harmirecruit.candidates') IS NULL THEN
    RAISE EXCEPTION
      'Wrong target: harmirecruit.jobs / harmirecruit.candidates not found in database "%". '
      'Switch to database harmoviajobs_courses_db (schema harmirecruit) and re-run.',
      current_database();
  END IF;
END
$$;

-- Every statement below is schema-qualified, so it cannot land in the wrong
-- schema even if search_path is not what you expect.

-- ---------------------------------------------------------------------------
-- 1. Job sector
-- ---------------------------------------------------------------------------
ALTER TABLE harmirecruit.jobs ADD COLUMN IF NOT EXISTS industry TEXT;

COMMENT ON COLUMN harmirecruit.jobs.industry IS
  'Sector: Information Technology, BPO, Insurance, Biotech, Healthcare, '
  'Manufacturing, Banking and Finance, Retail, FMCG. Drives sector-specific '
  'screening questions and the BPO-only location panels.';

-- Filtering/reporting by sector within a workspace.
CREATE INDEX IF NOT EXISTS jobs_industry_tenant_idx
  ON harmirecruit.jobs (tenant_id, industry)
  WHERE industry IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Resume ATS score
-- ---------------------------------------------------------------------------
ALTER TABLE harmirecruit.candidates ADD COLUMN IF NOT EXISTS ats_score REAL;
ALTER TABLE harmirecruit.candidates ADD COLUMN IF NOT EXISTS ats_details JSONB;

COMMENT ON COLUMN harmirecruit.candidates.ats_score IS
  '0-100 score for the uploaded resume: parseability, completeness, and JD '
  'keyword match. Computed after parsing. Not the same as ai_score (0-10 fit).';

COMMIT;

-- =============================================================================
-- OPTIONAL — review before running. Each block is independent.
-- =============================================================================

-- (a) Backfill sector for existing jobs from the title/client text.
--     Only fills rows where industry IS NULL; never overwrites a chosen value.
--     Inspect the match counts first, then run the UPDATE.
--
-- SELECT COUNT(*) FILTER (WHERE lower(title || ' ' || client) ~ '(bpo|bpm|voice process|call centre|call center|customer support|ites|telecaller)') AS bpo,
--        COUNT(*) FILTER (WHERE lower(title || ' ' || client) ~ '(software|developer|engineer|java|python|react|\.net|devops|qa )')            AS it,
--        COUNT(*) FILTER (WHERE industry IS NULL)                                                                                              AS unset
-- FROM harmirecruit.jobs;
--
-- BEGIN;
-- SET search_path TO harmirecruit, public;
-- UPDATE jobs SET industry = 'BPO'
--  WHERE industry IS NULL
--    AND lower(title || ' ' || client) ~ '(bpo|bpm|voice process|call centre|call center|customer support|ites|telecaller)';
-- UPDATE jobs SET industry = 'Information Technology'
--  WHERE industry IS NULL
--    AND lower(title || ' ' || client) ~ '(software|developer|engineer|java|python|react|\.net|devops|qa )';
-- COMMIT;

-- (b) Reclaim space from per-candidate question packs.
--     Screening/scheduled questions are now generated once per job and stored on
--     jobs.screening_questions. candidates.screening_questions is no longer read
--     by any code path; the column is kept so a rollback still works. Clear it
--     only once you are confident you will not roll back.
--
-- UPDATE harmirecruit.candidates SET screening_questions = NULL
--  WHERE screening_questions IS NOT NULL;

-- =============================================================================
-- Verification — expect 3 rows, then spot-check the new job column.
-- =============================================================================
-- SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'harmirecruit'
--    AND ((table_name = 'jobs'       AND column_name = 'industry')
--      OR (table_name = 'candidates' AND column_name IN ('ats_score', 'ats_details')))
--  ORDER BY table_name, column_name;
