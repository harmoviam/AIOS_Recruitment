-- =============================================================================
-- Harmovia Tenant Setup Script
-- Run in Cloud SQL against harmoviajobs_courses_db with schema harmirecruit
-- Creates: 1 tenant (pro plan), 1 admin, 3 recruiters
--
-- SECURITY: replace each REPLACE_WITH_*_BCRYPT_HASH placeholder locally before
-- execution. Never commit real password hashes to this public repository. The
-- validation below aborts before any tenant or user data is changed.
-- =============================================================================

DO $validate_harmovia_password_hashes$
DECLARE
  v_hash TEXT;
BEGIN
  FOREACH v_hash IN ARRAY ARRAY[
    'REPLACE_WITH_ADMIN_BCRYPT_HASH',
    'REPLACE_WITH_NIDHI_BCRYPT_HASH',
    'REPLACE_WITH_MOUMITA_BCRYPT_HASH',
    'REPLACE_WITH_SMRUTI_BCRYPT_HASH',
    'REPLACE_WITH_VIDHI_BCRYPT_HASH'
  ] LOOP
    IF v_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
      RAISE EXCEPTION 'Replace every bcrypt password hash placeholder before running this script';
    END IF;
  END LOOP;
END
$validate_harmovia_password_hashes$;

-- 1. Create the Harmovia tenant (pro plan)
INSERT INTO tenants (slug, name, plan, status, primary_color, logo_initials, features)
VALUES (
  'harmovia',
  'Harmovia',
  'pro',
  'active',
  '#2563EB',
  'HA',
  '["whatsapp", "ai_insights", "reports"]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  plan = 'pro',
  status = 'active',
  primary_color = '#2563EB',
  features = '["whatsapp", "ai_insights", "reports"]'::jsonb
RETURNING id, slug, name, plan, status;

-- 2. Create admin user
INSERT INTO users (email, password_hash, name, role, tenant_id)
VALUES (
  'admin@harmovia.com',
  'REPLACE_WITH_ADMIN_BCRYPT_HASH',
  'Harmovia Admin',
  'admin',
  (SELECT id FROM tenants WHERE slug = 'harmovia')
)
ON CONFLICT DO NOTHING
RETURNING id, email, name, role;

-- 3. Create 3 recruiter users
INSERT INTO users (email, password_hash, name, role, tenant_id)
VALUES
  (
    'nidhi@harmovia.com',
    'REPLACE_WITH_NIDHI_BCRYPT_HASH',
    'Nidhi',
    'recruiter',
    (SELECT id FROM tenants WHERE slug = 'harmovia')
  ),
  (
    'moumita@harmovia.com',
    'REPLACE_WITH_MOUMITA_BCRYPT_HASH',
    'Moumita',
    'recruiter',
    (SELECT id FROM tenants WHERE slug = 'harmovia')
  ),
  (
    'smruti@harmovia.com',
    'REPLACE_WITH_SMRUTI_BCRYPT_HASH',
    'Smruti Jena',
    'recruiter',
    (SELECT id FROM tenants WHERE slug = 'harmovia')
  ),
  (
    'vidhi@gmail.com',
    'REPLACE_WITH_VIDHI_BCRYPT_HASH',
    'Vidhi Patel',
    'recruiter',
    (SELECT id FROM tenants WHERE slug = 'harmovia')
  )
ON CONFLICT DO NOTHING
RETURNING id, email, name, role;

-- 4. Create default settings for the tenant
INSERT INTO settings (tenant_id, key, value) VALUES
  (
    (SELECT id FROM tenants WHERE slug = 'harmovia'),
    'branding',
    '{"companyName": "Harmovia", "primaryColor": "#2563EB"}'::jsonb
  ),
  (
    (SELECT id FROM tenants WHERE slug = 'harmovia'),
    'whatsapp',
    '{"connected": false}'::jsonb
  )
ON CONFLICT (tenant_id, key) DO UPDATE SET
  value = EXCLUDED.value;

-- =============================================================================
-- Verify setup
-- =============================================================================
SELECT t.id AS tenant_id, t.slug, t.name, t.plan, t.status,
       u.id AS user_id, u.email, u.name, u.role
FROM tenants t
LEFT JOIN users u ON u.tenant_id = t.id
WHERE t.slug = 'harmovia'
ORDER BY u.role, u.email;
