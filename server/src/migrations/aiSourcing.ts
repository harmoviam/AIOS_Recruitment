import type pg from 'pg';

/**
 * AI Talent Sourcing Agent — Sprint 1 tables.
 * Persists NL → structured candidate searches against the ATS talent pool.
 */
export const AI_SOURCING_SQL = `
CREATE TABLE IF NOT EXISTS ai_sourcing_searches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    query_text          TEXT NOT NULL,
    criteria_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_confidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_count        INTEGER NOT NULL DEFAULT 0,
    result_preview      JSONB NOT NULL DEFAULT '[]'::jsonb,
    parser_mode         VARCHAR(40) NOT NULL DEFAULT 'heuristic',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_sourcing_searches_parser_mode
      CHECK (parser_mode IN ('heuristic', 'llm', 'hybrid'))
);
CREATE INDEX IF NOT EXISTS ix_ai_sourcing_searches_user
    ON ai_sourcing_searches(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_sourcing_searches_tenant
    ON ai_sourcing_searches(tenant_id, created_at DESC);
`;

export async function migrateAiSourcing(client: pg.PoolClient): Promise<void> {
  await client.query(AI_SOURCING_SQL);
}
