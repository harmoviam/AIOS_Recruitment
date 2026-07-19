-- =============================================================================
-- HarmiRecruit — People Data Labs candidate search run log
-- Applied at runtime by: server/src/migrations/peopleSearch.ts
--   via migratePeopleSearch() in server/src/db.ts
-- This file is the ops/manual mirror for Cloud SQL / psql runs.
-- Runs inside existing schema (e.g. harmirecruit). Requires: tenants, users.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS people_search_run (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recruiter_user_id   INTEGER REFERENCES users(id),
    prompt_text         TEXT,
    filters_json        JSONB NOT NULL,
    result_json         JSONB NOT NULL,
    result_count        INT NOT NULL DEFAULT 0,
    provider            VARCHAR(40) NOT NULL DEFAULT 'PDL',
    credits_used        INT NOT NULL DEFAULT 0,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version             BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_people_search_run_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_people_search_run_user
    ON people_search_run(tenant_id, recruiter_user_id, created_date DESC);
