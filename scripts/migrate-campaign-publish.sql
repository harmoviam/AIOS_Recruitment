-- Campaign → careers-page publishing: a job can originate from a sourcing campaign.
-- Mirrors the idempotent statements applied by initDb() in server/src/db.ts —
-- running this manually is optional; the server applies it automatically on boot.
-- Run inside the app schema (e.g. SET search_path TO harmirecruit;).

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_campaign_id UUID
    REFERENCES sourcing_campaign(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_jobs_sourcing_campaign ON jobs(sourcing_campaign_id);
