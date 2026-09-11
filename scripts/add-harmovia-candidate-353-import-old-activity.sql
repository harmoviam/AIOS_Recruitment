BEGIN;

SET LOCAL search_path TO harmirecruit, public;

DO $add_import_old_activity$
DECLARE
  v_tenant_id INTEGER;
  v_admin_id INTEGER;
BEGIN
  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE slug = 'harmovia';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Harmovia tenant was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM candidates
    WHERE id = 353 AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Candidate 353 does not belong to the Harmovia tenant';
  END IF;

  SELECT id INTO v_admin_id
  FROM users
  WHERE tenant_id = v_tenant_id AND role = 'admin'
  ORDER BY id
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Harmovia admin user was not found';
  END IF;

  INSERT INTO activities (type, description, user_id, candidate_id, tenant_id)
  SELECT 'import', 'import old', v_admin_id, 353, v_tenant_id
  WHERE NOT EXISTS (
    SELECT 1 FROM activities
    WHERE candidate_id = 353
      AND tenant_id = v_tenant_id
      AND type = 'import'
      AND description = 'import old'
  );
END
$add_import_old_activity$;

COMMIT;

SELECT a.id, a.type, a.description, u.name AS actor, a.created_at
FROM harmirecruit.activities a
LEFT JOIN harmirecruit.users u ON u.id = a.user_id
WHERE a.candidate_id = 353
  AND a.tenant_id = (
    SELECT id FROM harmirecruit.tenants WHERE slug = 'harmovia'
  )
ORDER BY a.created_at DESC, a.id DESC;
