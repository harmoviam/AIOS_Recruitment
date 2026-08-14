import type pg from 'pg';

/**
 * Sync state for jobs posted to external boards (LinkedIn SJP first).
 */
export const LINKEDIN_JOB_POSTING_SQL = `
CREATE TABLE IF NOT EXISTS job_external_postings (
    id                       SERIAL PRIMARY KEY,
    tenant_id                INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_id                   INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    provider                 VARCHAR(40) NOT NULL DEFAULT 'LINKEDIN',
    external_job_posting_id  TEXT NOT NULL,
    status                   VARCHAR(40) NOT NULL DEFAULT 'pending',
    last_synced_at           TIMESTAMPTZ,
    last_error               TEXT,
    raw_response             JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_job_external_postings_tenant_job_provider UNIQUE (tenant_id, job_id, provider),
    CONSTRAINT ck_job_external_postings_status
      CHECK (status IN ('pending', 'live', 'closed', 'error'))
);
CREATE INDEX IF NOT EXISTS ix_job_external_postings_job
    ON job_external_postings(tenant_id, job_id);
`;

export async function migrateLinkedInJobPosting(client: pg.PoolClient): Promise<void> {
  await client.query(LINKEDIN_JOB_POSTING_SQL);
}
