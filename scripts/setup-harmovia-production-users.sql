-- HarmiRecruit: provision the approved Harmovia workspace users.
--
-- Target Cloud SQL database: harmoviajobs_courses_db
-- Target schema:             harmirecruit
--
-- Safe to rerun. For these five emails only, the script creates a missing user
-- or updates the existing user's canonical email, name, role, and password hash.
-- All other users (including info@harmoviajobs.com) remain unchanged.
--
-- SECURITY: replace each REPLACE_WITH_*_BCRYPT_HASH placeholder locally before
-- execution. Never commit real password hashes to this public repository. The
-- validation below aborts the entire transaction while a placeholder remains.

BEGIN;

SET LOCAL search_path TO harmirecruit, public;

DO $provision_harmovia_users$
DECLARE
  v_tenant_id INTEGER;
  v_tenant_count INTEGER;
  v_match_count INTEGER;
  v_user RECORD;
BEGIN
  SELECT COUNT(*), MIN(id)
    INTO v_tenant_count, v_tenant_id
  FROM tenants
  WHERE LOWER(slug) = 'harmovia';

  IF v_tenant_count <> 1 OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'Expected exactly one Harmovia tenant, found %; no users were changed',
      v_tenant_count;
  END IF;

  FOR v_user IN
    SELECT *
    FROM (VALUES
      (
        'nidhi@harmovia.com',
        'Nidhi',
        'hiring_manager',
        'REPLACE_WITH_NIDHI_BCRYPT_HASH'
      ),
      (
        'moumita@harmovia.com',
        'Moumita',
        'hiring_manager',
        'REPLACE_WITH_MOUMITA_BCRYPT_HASH'
      ),
      (
        'smruti@harmovia.com',
        'Smruti Jena',
        'hiring_manager',
        'REPLACE_WITH_SMRUTI_BCRYPT_HASH'
      ),
      (
        'vidhi@harmovia.com',
        'Vidhi Patel',
        'hiring_manager',
        'REPLACE_WITH_VIDHI_BCRYPT_HASH'
      ),
      (
        'admin@harmovia.com',
        'Admin',
        'admin',
        'REPLACE_WITH_ADMIN_BCRYPT_HASH'
      )
    ) AS desired(email, name, role, password_hash)
  LOOP
    IF v_user.password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
      RAISE EXCEPTION
        'Replace the bcrypt password hash placeholder for % before running this script',
        v_user.email;
    END IF;

    SELECT COUNT(*)
      INTO v_match_count
    FROM users
    WHERE tenant_id = v_tenant_id
      AND LOWER(email) = LOWER(v_user.email);

    IF v_match_count > 1 THEN
      RAISE EXCEPTION
        'Duplicate Harmovia users found for %; no users were changed',
        v_user.email;
    ELSIF v_match_count = 1 THEN
      UPDATE users
      SET email = v_user.email,
          name = v_user.name,
          role = v_user.role,
          password_hash = v_user.password_hash
      WHERE tenant_id = v_tenant_id
        AND LOWER(email) = LOWER(v_user.email);
    ELSE
      INSERT INTO users (email, password_hash, name, role, tenant_id)
      VALUES (
        v_user.email,
        v_user.password_hash,
        v_user.name,
        v_user.role,
        v_tenant_id
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'Harmovia user provisioning completed for tenant id %', v_tenant_id;
END
$provision_harmovia_users$;

COMMIT;

-- Verification: this must return exactly five rows with the expected roles.
SELECT
  u.id,
  u.email,
  u.name,
  u.role,
  t.slug AS tenant_slug
FROM harmirecruit.users u
JOIN harmirecruit.tenants t ON t.id = u.tenant_id
WHERE LOWER(t.slug) = 'harmovia'
  AND LOWER(u.email) IN (
    'nidhi@harmovia.com',
    'moumita@harmovia.com',
    'smruti@harmovia.com',
    'vidhi@harmovia.com',
    'admin@harmovia.com'
  )
ORDER BY
  CASE WHEN u.role = 'admin' THEN 1 ELSE 0 END,
  u.email;
