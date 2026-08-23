import type pg from 'pg';

/**
 * AI Talent Sourcing Agent — Sprint 1 + Sprint 2 tables.
 * Sprint 1: NL search persistence.
 * Sprint 2: JD intelligence, candidate AI profiles, skill ontology.
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
    job_id              INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_sourcing_searches_parser_mode
      CHECK (parser_mode IN ('heuristic', 'llm', 'hybrid'))
);
CREATE INDEX IF NOT EXISTS ix_ai_sourcing_searches_user
    ON ai_sourcing_searches(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_sourcing_searches_tenant
    ON ai_sourcing_searches(tenant_id, created_at DESC);

-- Sprint 2: structured JD intelligence (does not overwrite jobs.description)
CREATE TABLE IF NOT EXISTS ai_job_intelligence (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_id              INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    intelligence_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_confidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
    parser_mode         VARCHAR(40) NOT NULL DEFAULT 'heuristic',
    prompt_version      VARCHAR(40) NOT NULL DEFAULT 'jd-analysis@1',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, job_id)
);
CREATE INDEX IF NOT EXISTS ix_ai_job_intelligence_job
    ON ai_job_intelligence(tenant_id, job_id);

-- Sprint 2: normalized AI candidate profile (never overwrites resume_text / parsed_profile)
CREATE TABLE IF NOT EXISTS candidate_ai_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    candidate_id        INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    profile_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_confidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
    parser_mode         VARCHAR(40) NOT NULL DEFAULT 'heuristic',
    prompt_version      VARCHAR(40) NOT NULL DEFAULT 'candidate-analysis@1',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS ix_candidate_ai_profiles_candidate
    ON candidate_ai_profiles(tenant_id, candidate_id);

-- Sprint 2: configurable skill ontology
CREATE TABLE IF NOT EXISTS ai_skills (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    normalized_name     TEXT NOT NULL UNIQUE,
    category            VARCHAR(80),
    description         TEXT
);
CREATE TABLE IF NOT EXISTS ai_skill_aliases (
    id                  SERIAL PRIMARY KEY,
    skill_id            INTEGER NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,
    alias               TEXT NOT NULL,
    normalized_alias    TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS ai_skill_relationships (
    id                  SERIAL PRIMARY KEY,
    parent_skill_id     INTEGER NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,
    child_skill_id      INTEGER NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,
    relationship_type   VARCHAR(40) NOT NULL,
    weight              REAL NOT NULL DEFAULT 1.0,
    UNIQUE (parent_skill_id, child_skill_id, relationship_type),
    CONSTRAINT ck_ai_skill_rel_type CHECK (
      relationship_type IN (
        'RELATED_TO', 'SPECIALIZATION_OF', 'ALTERNATIVE_TO', 'USED_WITH', 'REQUIRES'
      )
    )
);
`;

const SKILL_SEED: Array<{
  name: string;
  category: string;
  aliases?: string[];
}> = [
  { name: 'AWS', category: 'Cloud', aliases: ['amazon web services', 'amazon aws'] },
  { name: 'EC2', category: 'Cloud' },
  { name: 'EKS', category: 'Cloud', aliases: ['elastic kubernetes service'] },
  { name: 'ECS', category: 'Cloud' },
  { name: 'IAM', category: 'Cloud' },
  { name: 'Lambda', category: 'Cloud', aliases: ['aws lambda'] },
  { name: 'VPC', category: 'Cloud' },
  { name: 'CloudFormation', category: 'Cloud', aliases: ['cfn'] },
  { name: 'Kubernetes', category: 'DevOps', aliases: ['k8s'] },
  { name: 'Helm', category: 'DevOps' },
  { name: 'Terraform', category: 'DevOps', aliases: ['tf'] },
  { name: 'Docker', category: 'DevOps' },
  { name: 'Jenkins', category: 'DevOps' },
  { name: 'GitHub Actions', category: 'DevOps', aliases: ['gha'] },
  { name: 'Ansible', category: 'DevOps' },
  { name: 'Java', category: 'Language' },
  { name: 'Spring Boot', category: 'Backend', aliases: ['springboot', 'spring'] },
  { name: 'Microservices', category: 'Architecture' },
  { name: 'React', category: 'Frontend', aliases: ['react.js', 'reactjs'] },
  { name: 'TypeScript', category: 'Language', aliases: ['ts'] },
  { name: 'Python', category: 'Language' },
  { name: 'Node.js', category: 'Backend', aliases: ['nodejs', 'node'] },
  { name: 'PostgreSQL', category: 'Database', aliases: ['postgres', 'psql'] },
  { name: 'Azure', category: 'Cloud' },
  { name: 'AKS', category: 'Cloud', aliases: ['azure kubernetes service'] },
  { name: 'GKE', category: 'Cloud', aliases: ['google kubernetes engine'] },
];

/** parent → child with relationship */
const SKILL_RELS: Array<[string, string, string, number]> = [
  ['AWS', 'EC2', 'RELATED_TO', 0.8],
  ['AWS', 'EKS', 'RELATED_TO', 0.95],
  ['AWS', 'ECS', 'RELATED_TO', 0.85],
  ['AWS', 'IAM', 'RELATED_TO', 0.8],
  ['AWS', 'Lambda', 'RELATED_TO', 0.85],
  ['AWS', 'VPC', 'RELATED_TO', 0.8],
  ['AWS', 'CloudFormation', 'RELATED_TO', 0.9],
  ['EKS', 'Kubernetes', 'REQUIRES', 1.0],
  ['EKS', 'AWS', 'REQUIRES', 1.0],
  ['AKS', 'Kubernetes', 'REQUIRES', 1.0],
  ['AKS', 'Azure', 'REQUIRES', 1.0],
  ['GKE', 'Kubernetes', 'REQUIRES', 1.0],
  ['CloudFormation', 'AWS', 'REQUIRES', 0.95],
  ['Helm', 'Kubernetes', 'USED_WITH', 0.9],
  ['Terraform', 'AWS', 'USED_WITH', 0.7],
  ['Spring Boot', 'Java', 'REQUIRES', 0.95],
  ['Spring Boot', 'Microservices', 'USED_WITH', 0.7],
  ['React', 'TypeScript', 'USED_WITH', 0.6],
];

async function ensureJobIdColumn(client: pg.PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE ai_sourcing_searches
      ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL
  `);
}

async function upsertSkill(
  client: pg.PoolClient,
  name: string,
  category: string
): Promise<number> {
  const normalized = name.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const { rows } = await client.query(
    `INSERT INTO ai_skills (name, normalized_name, category)
     VALUES ($1, $2, $3)
     ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category
     RETURNING id`,
    [name, normalized, category]
  );
  return rows[0].id as number;
}

async function seedSkillOntology(client: pg.PoolClient): Promise<void> {
  const ids = new Map<string, number>();
  for (const skill of SKILL_SEED) {
    const id = await upsertSkill(client, skill.name, skill.category);
    ids.set(skill.name, id);
    for (const alias of skill.aliases || []) {
      const normalizedAlias = alias
        .toLowerCase()
        .replace(/[^a-z0-9+#.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      await client.query(
        `INSERT INTO ai_skill_aliases (skill_id, alias, normalized_alias)
         VALUES ($1, $2, $3)
         ON CONFLICT (normalized_alias) DO UPDATE SET skill_id = EXCLUDED.skill_id, alias = EXCLUDED.alias`,
        [id, alias, normalizedAlias]
      );
    }
  }

  for (const [parent, child, rel, weight] of SKILL_RELS) {
    const parentId = ids.get(parent);
    const childId = ids.get(child);
    if (!parentId || !childId) continue;
    await client.query(
      `INSERT INTO ai_skill_relationships (parent_skill_id, child_skill_id, relationship_type, weight)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (parent_skill_id, child_skill_id, relationship_type)
       DO UPDATE SET weight = EXCLUDED.weight`,
      [parentId, childId, rel, weight]
    );
  }
}

export async function migrateAiSourcing(client: pg.PoolClient): Promise<void> {
  await client.query(AI_SOURCING_SQL);
  await ensureJobIdColumn(client);
  await seedSkillOntology(client);
}
