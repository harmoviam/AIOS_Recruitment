-- AIOS Recruitment production migration for Harmovia candidate synchronization.
-- Run against the AIOS database that contains the `harmirecruit` schema.
-- Safe to rerun: existing candidates are re-queued without creating duplicate outbox rows.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('aios_harmovia_candidate_sync'));

CREATE TABLE IF NOT EXISTS harmirecruit.harmovia_candidate_sync_outbox (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES harmirecruit.tenants(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES harmirecruit.candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id)
);

CREATE INDEX IF NOT EXISTS ix_harmovia_sync_pending
  ON harmirecruit.harmovia_candidate_sync_outbox(status, next_attempt_at, id);

CREATE OR REPLACE FUNCTION harmirecruit.enqueue_harmovia_candidate_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM harmirecruit.tenants t
    WHERE t.id = NEW.tenant_id
      AND LOWER(t.slug) = 'harmovia'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO harmirecruit.harmovia_candidate_sync_outbox (
    tenant_id, candidate_id, status, attempts, next_attempt_at,
    last_error, delivered_at, updated_at
  ) VALUES (
    NEW.tenant_id, NEW.id, 'pending', 0, NOW(), NULL, NULL, NOW()
  )
  ON CONFLICT (candidate_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    status = 'pending',
    attempts = 0,
    next_attempt_at = NOW(),
    last_error = NULL,
    delivered_at = NULL,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_harmovia_candidate_sync
  ON harmirecruit.candidates;
CREATE TRIGGER trg_enqueue_harmovia_candidate_sync
  AFTER INSERT OR UPDATE OF name, email, phone, current_location,
    highest_qualification, job_id
  ON harmirecruit.candidates
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NOT NULL)
  EXECUTE FUNCTION harmirecruit.enqueue_harmovia_candidate_sync();

CREATE OR REPLACE FUNCTION harmirecruit.enqueue_harmovia_job_candidates()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO harmirecruit.harmovia_candidate_sync_outbox (
    tenant_id, candidate_id, status, attempts, next_attempt_at,
    last_error, delivered_at, updated_at
  )
  SELECT c.tenant_id, c.id, 'pending', 0, NOW(), NULL, NULL, NOW()
  FROM harmirecruit.candidates c
  JOIN harmirecruit.tenants t
    ON t.id = c.tenant_id
   AND LOWER(t.slug) = 'harmovia'
  WHERE c.job_id = NEW.id
    AND c.tenant_id = NEW.tenant_id
  ON CONFLICT (candidate_id) DO UPDATE SET
    status = 'pending',
    attempts = 0,
    next_attempt_at = NOW(),
    last_error = NULL,
    delivered_at = NULL,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_harmovia_job_candidates
  ON harmirecruit.jobs;
CREATE TRIGGER trg_enqueue_harmovia_job_candidates
  AFTER UPDATE OF title
  ON harmirecruit.jobs
  FOR EACH ROW
  WHEN (OLD.title IS DISTINCT FROM NEW.title)
  EXECUTE FUNCTION harmirecruit.enqueue_harmovia_job_candidates();

-- Queue existing candidates for the Harmovia tenant only.
INSERT INTO harmirecruit.harmovia_candidate_sync_outbox (
  tenant_id, candidate_id, status, attempts, next_attempt_at,
  last_error, delivered_at, updated_at
)
SELECT c.tenant_id, c.id, 'pending', 0, NOW(), NULL, NULL, NOW()
FROM harmirecruit.candidates c
JOIN harmirecruit.tenants t ON t.id = c.tenant_id
WHERE LOWER(t.slug) = 'harmovia'
ON CONFLICT (candidate_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  status = 'pending',
  attempts = 0,
  next_attempt_at = NOW(),
  last_error = NULL,
  delivered_at = NULL,
  updated_at = NOW();

COMMIT;

-- Verification: non_harmovia_rows must be zero.
SELECT status, COUNT(*)::int AS candidate_count
FROM harmirecruit.harmovia_candidate_sync_outbox
GROUP BY status
ORDER BY status;

SELECT COUNT(*)::int AS non_harmovia_rows
FROM harmirecruit.harmovia_candidate_sync_outbox o
JOIN harmirecruit.tenants t ON t.id = o.tenant_id
WHERE LOWER(t.slug) <> 'harmovia';
