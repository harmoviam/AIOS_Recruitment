-- =============================================================================
-- EarlyJobs — org admin, hiring managers, and recruiters (idempotent)
-- =============================================================================
-- Run in Cloud SQL Studio or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/seed-earlyjobs-users.sql
--
-- Users created / updated:
--   admin           jyoti@earlyjobs.in     passwordJyoti@123
--   hiring_manager  moumita@earlyjobs.in   HM@123
--   hiring_manager  nidhi@earlyjobs.in     HM@123
--   recruiter       smruti@earlyjobs.in    Password@123  → reports to Nidhi
--   recruiter       vidhi@earlyjobs.in     Password@123  → reports to Moumita
-- =============================================================================

BEGIN;

SET search_path TO harmirecruit, public;

INSERT INTO tenants (slug, name, plan, status, primary_color, logo_initials, features)
VALUES (
  'earlyjobs',
  'EarlyJobs',
  'pro',
  'active',
  '#EA580C',
  'EJ',
  '["whatsapp", "ai_insights", "automation", "reports"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v_tenant_id INTEGER;
  v_moumita_id INTEGER;
  v_nidhi_id INTEGER;
  v_hash_admin TEXT := '$2a$10$oSr9QtcMxh2tvuxpKfEPyuc2WfEceQbYJeVhBLpeSsh.A6V7dGWEu';   -- passwordJyoti@123
  v_hash_hm TEXT := '$2a$10$.5gcWHY8Z/o3omL/KQ6z.eIwX9Bc9CHhPKO/T0a8l4c1.S4wLgVTq';       -- HM@123
  v_hash_recruiter TEXT := '$2a$10$M7m/QNN/NjPrUWMPNBRYbe6sKLfBF57MbXEM6kVdbB/ucHB4m7tJq'; -- Password@123
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'earlyjobs';
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'earlyjobs tenant not found after insert';
  END IF;

  -- Org admin
  IF EXISTS (SELECT 1 FROM users WHERE tenant_id = v_tenant_id AND email = 'jyoti@earlyjobs.in') THEN
    UPDATE users
    SET password_hash = v_hash_admin, name = 'Jyoti', role = 'admin', managed_by_id = NULL, company_id = NULL
    WHERE tenant_id = v_tenant_id AND email = 'jyoti@earlyjobs.in';
  ELSE
    INSERT INTO users (email, password_hash, name, role, tenant_id)
    VALUES ('jyoti@earlyjobs.in', v_hash_admin, 'Jyoti', 'admin', v_tenant_id);
  END IF;

  -- Hiring manager: Moumita
  IF EXISTS (SELECT 1 FROM users WHERE tenant_id = v_tenant_id AND email = 'moumita@earlyjobs.in') THEN
    UPDATE users
    SET password_hash = v_hash_hm, name = 'Moumita', role = 'hiring_manager', managed_by_id = NULL
    WHERE tenant_id = v_tenant_id AND email = 'moumita@earlyjobs.in';
  ELSE
    INSERT INTO users (email, password_hash, name, role, tenant_id)
    VALUES ('moumita@earlyjobs.in', v_hash_hm, 'Moumita', 'hiring_manager', v_tenant_id);
  END IF;

  SELECT id INTO v_moumita_id FROM users WHERE tenant_id = v_tenant_id AND email = 'moumita@earlyjobs.in';

  -- Hiring manager: Nidhi
  IF EXISTS (SELECT 1 FROM users WHERE tenant_id = v_tenant_id AND email = 'nidhi@earlyjobs.in') THEN
    UPDATE users
    SET password_hash = v_hash_hm, name = 'Nidhi', role = 'hiring_manager', managed_by_id = NULL
    WHERE tenant_id = v_tenant_id AND email = 'nidhi@earlyjobs.in';
  ELSE
    INSERT INTO users (email, password_hash, name, role, tenant_id)
    VALUES ('nidhi@earlyjobs.in', v_hash_hm, 'Nidhi', 'hiring_manager', v_tenant_id);
  END IF;

  SELECT id INTO v_nidhi_id FROM users WHERE tenant_id = v_tenant_id AND email = 'nidhi@earlyjobs.in';

  -- Recruiter: Smruti → Nidhi
  IF EXISTS (SELECT 1 FROM users WHERE tenant_id = v_tenant_id AND email = 'smruti@earlyjobs.in') THEN
    UPDATE users
    SET password_hash = v_hash_recruiter, name = 'Smruti', role = 'recruiter', managed_by_id = v_nidhi_id
    WHERE tenant_id = v_tenant_id AND email = 'smruti@earlyjobs.in';
  ELSE
    INSERT INTO users (email, password_hash, name, role, tenant_id, managed_by_id)
    VALUES ('smruti@earlyjobs.in', v_hash_recruiter, 'Smruti', 'recruiter', v_tenant_id, v_nidhi_id);
  END IF;

  -- Recruiter: Vidhi → Moumita
  IF EXISTS (SELECT 1 FROM users WHERE tenant_id = v_tenant_id AND email = 'vidhi@earlyjobs.in') THEN
    UPDATE users
    SET password_hash = v_hash_recruiter, name = 'Vidhi', role = 'recruiter', managed_by_id = v_moumita_id
    WHERE tenant_id = v_tenant_id AND email = 'vidhi@earlyjobs.in';
  ELSE
    INSERT INTO users (email, password_hash, name, role, tenant_id, managed_by_id)
    VALUES ('vidhi@earlyjobs.in', v_hash_recruiter, 'Vidhi', 'recruiter', v_tenant_id, v_moumita_id);
  END IF;
END $$;

COMMIT;

-- Verify hierarchy
SET search_path TO harmirecruit, public;

SELECT
  u.role,
  u.name,
  u.email,
  hm.name AS reports_to
FROM tenants t
JOIN users u ON u.tenant_id = t.id
LEFT JOIN users hm ON hm.id = u.managed_by_id
WHERE t.slug = 'earlyjobs'
  AND u.email IN (
    'jyoti@earlyjobs.in',
    'moumita@earlyjobs.in',
    'nidhi@earlyjobs.in',
    'smruti@earlyjobs.in',
    'vidhi@earlyjobs.in'
  )
ORDER BY
  CASE u.role
    WHEN 'admin' THEN 1
    WHEN 'hiring_manager' THEN 2
    WHEN 'recruiter' THEN 3
    ELSE 4
  END,
  u.name;
