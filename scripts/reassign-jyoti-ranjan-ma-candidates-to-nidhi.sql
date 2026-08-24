-- Reassign direct candidate ownership from the Harmovia admin account
-- "Jyoti Ranjan Ma" to the Harmovia HM account "HM --Nidhi".
--
-- Target database: harmoviajobs_courses_db
-- Target schema:   harmirecruit
-- Target tenant:   harmovia
--
-- This script intentionally updates only candidates directly owned by the
-- source account. It does not move recruiters or their indirectly owned candidates.
-- Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/reassign-jyoti-ranjan-ma-candidates-to-nidhi.sql

BEGIN;

SET LOCAL search_path TO harmirecruit, public;

CREATE TEMP TABLE candidate_hm_reassignment_scope (
  candidate_id INTEGER PRIMARY KEY
) ON COMMIT PRESERVE ROWS;

DO $reassign_candidates$
DECLARE
  v_tenant_id INTEGER;
  v_source_hm_id INTEGER;
  v_target_hm_id INTEGER;
  v_source_count INTEGER;
  v_target_count INTEGER;
  v_candidate_count INTEGER;
  v_updated_candidates INTEGER;
  v_updated_applications INTEGER;
BEGIN
  SELECT id
    INTO v_tenant_id
  FROM tenants
  WHERE slug = 'harmovia';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Harmovia tenant not found; no candidates were changed';
  END IF;

  SELECT COUNT(*), MIN(id)
    INTO v_source_count, v_source_hm_id
  FROM users
  WHERE tenant_id = v_tenant_id
    AND role = 'admin'
    AND LOWER(BTRIM(email)) = 'info@harmoviajobs.com';

  IF v_source_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one admin with email info@harmoviajobs.com in the Harmovia tenant, found %; no candidates were changed',
      v_source_count;
  END IF;

  SELECT COUNT(*), MIN(id)
    INTO v_target_count, v_target_hm_id
  FROM users
  WHERE tenant_id = v_tenant_id
    AND role = 'hiring_manager'
    AND LOWER(BTRIM(email)) = 'nidhi@harmovia.com';

  IF v_target_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one hiring manager with email nidhi@harmovia.com in the Harmovia tenant, found %; no candidates were changed',
      v_target_count;
  END IF;

  INSERT INTO candidate_hm_reassignment_scope (candidate_id)
  SELECT id
  FROM candidates
  WHERE tenant_id = v_tenant_id
    AND recruiter_id = v_source_hm_id;
  GET DIAGNOSTICS v_candidate_count = ROW_COUNT;

  IF v_candidate_count <> 20 THEN
    RAISE EXCEPTION
      'Expected exactly 20 candidates directly owned by Jyoti Ranjan Ma, found %; no candidates were changed',
      v_candidate_count;
  END IF;

  -- Keep all application-level ownership in step with the candidate owner.
  UPDATE applications
  SET recruiter_id = v_target_hm_id,
      updated_at = NOW()
  WHERE tenant_id = v_tenant_id
    AND candidate_id IN (SELECT candidate_id FROM candidate_hm_reassignment_scope)
    AND recruiter_id = v_source_hm_id;
  GET DIAGNOSTICS v_updated_applications = ROW_COUNT;

  UPDATE candidates
  SET recruiter_id = v_target_hm_id,
      updated_at = NOW()
  WHERE tenant_id = v_tenant_id
    AND recruiter_id = v_source_hm_id
    AND id IN (SELECT candidate_id FROM candidate_hm_reassignment_scope);
  GET DIAGNOSTICS v_updated_candidates = ROW_COUNT;

  IF v_updated_candidates <> v_candidate_count THEN
    RAISE EXCEPTION
      'Candidate verification failed: expected to update %, updated %; transaction will be rolled back',
      v_candidate_count,
      v_updated_candidates;
  END IF;

  RAISE NOTICE
    'Reassigned % candidate(s) and % application row(s) from Jyoti Ranjan Ma (id %) to HM --Nidhi (id %) in tenant id %',
    v_updated_candidates,
    v_updated_applications,
    v_source_hm_id,
    v_target_hm_id,
    v_tenant_id;
END
$reassign_candidates$;

COMMIT;

-- Verification: this returns exactly the candidates changed by this run.
SELECT
  c.id AS candidate_id,
  c.name AS candidate_name,
  c.email AS candidate_email,
  owner.id AS hiring_manager_id,
  owner.name AS hiring_manager_name,
  c.updated_at
FROM harmirecruit.candidates c
JOIN candidate_hm_reassignment_scope scope
  ON scope.candidate_id = c.id
JOIN harmirecruit.tenants t
  ON t.id = c.tenant_id
JOIN harmirecruit.users owner
  ON owner.id = c.recruiter_id
 AND owner.tenant_id = c.tenant_id
WHERE t.slug = 'harmovia'
  AND owner.role = 'hiring_manager'
  AND LOWER(BTRIM(owner.email)) = 'nidhi@harmovia.com'
ORDER BY c.updated_at DESC, c.id;

DROP TABLE candidate_hm_reassignment_scope;
