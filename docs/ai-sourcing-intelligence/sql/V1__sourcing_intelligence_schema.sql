-- =============================================================================
-- HarmiRecruit — AI Sourcing Intelligence Agent
-- V1 schema (Node / Express) — Version 2.0
-- Applied by: migrateSourcingIntelligence() in server/src/db.ts
-- Mirrored to: scripts/migrate-sourcing-intelligence.sql (on Sprint 1)
-- Runs inside existing schema (e.g. harmirecruit). Requires: tenants, users.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- GEO
-- =============================================================================

CREATE TABLE IF NOT EXISTS sourcing_country (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(10)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    phone_code      VARCHAR(10),
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_sourcing_country_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_sourcing_country_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS sourcing_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    country_id      UUID         NOT NULL REFERENCES sourcing_country(id) ON DELETE CASCADE,
    code            VARCHAR(20)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_sourcing_state_tenant_country_code UNIQUE (tenant_id, country_id, code),
    CONSTRAINT ck_sourcing_state_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_sourcing_state_country_id ON sourcing_state(country_id);
CREATE INDEX IF NOT EXISTS ix_sourcing_state_tenant ON sourcing_state(tenant_id);

CREATE TABLE IF NOT EXISTS sourcing_city (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    state_id                    UUID         NOT NULL REFERENCES sourcing_state(id) ON DELETE CASCADE,
    name                        VARCHAR(120) NOT NULL,
    latitude                    NUMERIC(10, 7),
    longitude                   NUMERIC(10, 7),
    population                  BIGINT,
    freshers_availability       INT,
    engineering_colleges        INT,
    degree_colleges             INT,
    mba_colleges                INT,
    training_institutes         INT,
    spoken_english_institutes   INT,
    bpo_companies               INT,
    it_companies                INT,
    average_salary              NUMERIC(12, 2),
    language_availability       JSONB        NOT NULL DEFAULT '[]'::jsonb,
    night_shift_acceptance      INT,
    women_workforce_pct         NUMERIC(5, 2),
    migration_pct               NUMERIC(5, 2),
    public_transport_score      INT,
    cost_of_living_index        NUMERIC(8, 2),
    hiring_difficulty           INT,
    created_date                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                  VARCHAR(100),
    status                      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version                     BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_sourcing_city_tenant_state_name UNIQUE (tenant_id, state_id, name),
    CONSTRAINT ck_sourcing_city_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_sourcing_city_state_id ON sourcing_city(state_id);
CREATE INDEX IF NOT EXISTS ix_sourcing_city_tenant_name ON sourcing_city(tenant_id, name);

-- =============================================================================
-- TALENT MASTERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS recruitment_category (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(40)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    description     TEXT,
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_recruitment_category_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_recruitment_category_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS sourcing_industry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(40)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    description     TEXT,
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_sourcing_industry_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_sourcing_industry_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS sourcing_role (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    industry_id               UUID REFERENCES sourcing_industry(id),
    recruitment_category_id   UUID REFERENCES recruitment_category(id),
    code                      VARCHAR(60)  NOT NULL,
    name                      VARCHAR(160) NOT NULL,
    description               TEXT,
    aliases                   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_date              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                VARCHAR(100),
    status                    VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version                   BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_sourcing_role_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_sourcing_role_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_sourcing_role_industry ON sourcing_role(industry_id);
CREATE INDEX IF NOT EXISTS ix_sourcing_role_tenant_name ON sourcing_role(tenant_id, name);

CREATE TABLE IF NOT EXISTS qualification (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(40)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    rank_order      INT          NOT NULL DEFAULT 0,
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_qualification_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_qualification_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS experience_level (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(40)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    min_years       NUMERIC(4, 1),
    max_years       NUMERIC(4, 1),
    rank_order      INT          NOT NULL DEFAULT 0,
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_experience_level_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_experience_level_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS salary_range (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(40)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    min_amount      NUMERIC(12, 2) NOT NULL,
    max_amount      NUMERIC(12, 2) NOT NULL,
    currency        VARCHAR(3)   NOT NULL DEFAULT 'INR',
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_salary_range_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_salary_range_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    CONSTRAINT ck_salary_range_bounds CHECK (min_amount <= max_amount)
);

-- =============================================================================
-- SOURCE INTELLIGENCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS source_category (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(40)  NOT NULL,
    name            VARCHAR(120) NOT NULL,
    description     TEXT,
    created_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uq_source_category_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_source_category_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS source (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 INTEGER      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_category_id        UUID         NOT NULL REFERENCES source_category(id),
    city_id                   UUID         REFERENCES sourcing_city(id),
    state_id                  UUID         REFERENCES sourcing_state(id),
    name                      VARCHAR(200) NOT NULL,
    channel_type              VARCHAR(40)  NOT NULL,
    location_text             VARCHAR(255),
    latitude                  NUMERIC(10, 7),
    longitude                 NUMERIC(10, 7),
    website                   VARCHAR(500),
    contact_person            VARCHAR(160),
    phone                     VARCHAR(40),
    email                     VARCHAR(160),
    notes                     TEXT,
    member_count              INT,
    daily_active_members      INT,
    posting_rules             TEXT,
    last_verified             DATE,
    quality_rating            NUMERIC(4, 2),
    response_rate             NUMERIC(5, 2),
    estimated_candidate_pool  INT,
    created_date              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    modified_date             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by                VARCHAR(100),
    status                    VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    version                   BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_source_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    CONSTRAINT ck_source_channel CHECK (channel_type IN (
        'FACEBOOK', 'WHATSAPP', 'TELEGRAM', 'LINKEDIN', 'INSTAGRAM',
        'COLLEGE', 'TRAINING_INSTITUTE', 'REFERRAL', 'JOB_PORTAL', 'OTHER'
    ))
);
CREATE INDEX IF NOT EXISTS ix_source_tenant_city ON source(tenant_id, city_id);
CREATE INDEX IF NOT EXISTS ix_source_category_id ON source(source_category_id);
CREATE INDEX IF NOT EXISTS ix_source_channel_type ON source(channel_type);
CREATE INDEX IF NOT EXISTS ix_source_name ON source(tenant_id, name);

CREATE TABLE IF NOT EXISTS source_role (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id       UUID NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES sourcing_role(id),
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_source_role UNIQUE (source_id, role_id),
    CONSTRAINT ck_source_role_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_source_role_role_id ON source_role(role_id);

CREATE TABLE IF NOT EXISTS source_industry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id       UUID NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    industry_id     UUID NOT NULL REFERENCES sourcing_industry(id),
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_source_industry UNIQUE (source_id, industry_id),
    CONSTRAINT ck_source_industry_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS source_experience_level (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id            UUID NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    experience_level_id  UUID NOT NULL REFERENCES experience_level(id),
    created_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           VARCHAR(100),
    status               VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version              BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_source_experience_level UNIQUE (source_id, experience_level_id),
    CONSTRAINT ck_source_experience_level_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS source_language (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id       UUID NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    language_code   VARCHAR(20) NOT NULL,
    language_name   VARCHAR(80) NOT NULL,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_source_language UNIQUE (source_id, language_code),
    CONSTRAINT ck_source_language_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS source_tag (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id       UUID NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    tag             VARCHAR(80) NOT NULL,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_source_tag UNIQUE (source_id, tag),
    CONSTRAINT ck_source_tag_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_source_tag_tag ON source_tag(tenant_id, tag);

CREATE TABLE IF NOT EXISTS source_performance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id           UUID NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    city_id             UUID REFERENCES sourcing_city(id),
    role_id             UUID REFERENCES sourcing_role(id),
    period_start        DATE,
    period_end          DATE,
    applications        INT NOT NULL DEFAULT 0,
    interviews          INT NOT NULL DEFAULT 0,
    offers              INT NOT NULL DEFAULT 0,
    joinings            INT NOT NULL DEFAULT 0,
    no_shows            INT NOT NULL DEFAULT 0,
    offer_drops         INT NOT NULL DEFAULT 0,
    success_score       NUMERIC(6, 3) NOT NULL DEFAULT 0,
    past_success_rate   NUMERIC(6, 3) NOT NULL DEFAULT 0,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version             BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_source_performance_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_source_performance_dims
    ON source_performance(tenant_id, source_id, city_id, role_id);

-- =============================================================================
-- CAMPAIGNS & LEARNING (recruiter = users.id)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sourcing_campaign (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recruiter_user_id       INTEGER NOT NULL REFERENCES users(id),
    role_id                 UUID NOT NULL REFERENCES sourcing_role(id),
    city_id                 UUID NOT NULL REFERENCES sourcing_city(id),
    experience_level_id     UUID REFERENCES experience_level(id),
    name                    VARCHAR(200) NOT NULL,
    hiring_count            INT NOT NULL,
    joining_timeline_days   INT,
    salary_min              NUMERIC(12, 2),
    salary_max              NUMERIC(12, 2),
    shift_type              VARCHAR(40),
    gender_preference       VARCHAR(20) DEFAULT 'ANY',
    start_date              DATE,
    end_date                DATE,
    notes                   TEXT,
    created_date            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              VARCHAR(100),
    status                  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version                 BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_sourcing_campaign_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'COMPLETED')),
    CONSTRAINT ck_sourcing_campaign_hiring_count CHECK (hiring_count > 0)
);
CREATE INDEX IF NOT EXISTS ix_sourcing_campaign_user ON sourcing_campaign(tenant_id, recruiter_user_id);
CREATE INDEX IF NOT EXISTS ix_sourcing_campaign_city_role ON sourcing_campaign(city_id, role_id);

CREATE TABLE IF NOT EXISTS campaign_source (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id      UUID NOT NULL REFERENCES sourcing_campaign(id) ON DELETE CASCADE,
    source_id        UUID NOT NULL REFERENCES source(id),
    priority         INT NOT NULL DEFAULT 1,
    allocated_target INT,
    notes            TEXT,
    created_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       VARCHAR(100),
    status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version          BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_campaign_source UNIQUE (campaign_id, source_id),
    CONSTRAINT ck_campaign_source_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_campaign_source_source_id ON campaign_source(source_id);

CREATE TABLE IF NOT EXISTS sourcing_recruiter_activity (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recruiter_user_id   INTEGER NOT NULL REFERENCES users(id),
    source_id           UUID NOT NULL REFERENCES source(id),
    campaign_id         UUID REFERENCES sourcing_campaign(id),
    city_id             UUID REFERENCES sourcing_city(id),
    role_id             UUID REFERENCES sourcing_role(id),
    activity_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    applications        INT NOT NULL DEFAULT 0,
    interviews          INT NOT NULL DEFAULT 0,
    offers              INT NOT NULL DEFAULT 0,
    joinings            INT NOT NULL DEFAULT 0,
    no_shows            INT NOT NULL DEFAULT 0,
    offer_drops         INT NOT NULL DEFAULT 0,
    notes               TEXT,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version             BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_sourcing_recruiter_activity_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_sourcing_activity_user
    ON sourcing_recruiter_activity(tenant_id, recruiter_user_id, created_date);
CREATE INDEX IF NOT EXISTS ix_sourcing_activity_source ON sourcing_recruiter_activity(source_id);

-- =============================================================================
-- MARKET SUPPLY / DEMAND
-- =============================================================================

CREATE TABLE IF NOT EXISTS sourcing_market_company (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    city_id         UUID REFERENCES sourcing_city(id),
    industry_id     UUID REFERENCES sourcing_industry(id),
    name            VARCHAR(200) NOT NULL,
    company_type    VARCHAR(40),
    employee_count  INT,
    website         VARCHAR(500),
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version         BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_sourcing_market_company_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_sourcing_market_company_city ON sourcing_market_company(city_id);

CREATE TABLE IF NOT EXISTS company_hiring (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_id           UUID NOT NULL REFERENCES sourcing_market_company(id) ON DELETE CASCADE,
    role_id              UUID NOT NULL REFERENCES sourcing_role(id),
    city_id              UUID NOT NULL REFERENCES sourcing_city(id),
    salary_range_id      UUID REFERENCES salary_range(id),
    open_positions       INT NOT NULL DEFAULT 0,
    experience_level_id  UUID REFERENCES experience_level(id),
    shift_type           VARCHAR(40),
    urgency_days         INT,
    notes                TEXT,
    created_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           VARCHAR(100),
    status               VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version              BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_company_hiring_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_company_hiring_dims ON company_hiring(tenant_id, city_id, role_id);

CREATE TABLE IF NOT EXISTS candidate_supply (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    city_id              UUID NOT NULL REFERENCES sourcing_city(id),
    role_id              UUID NOT NULL REFERENCES sourcing_role(id),
    experience_level_id  UUID REFERENCES experience_level(id),
    qualification_id     UUID REFERENCES qualification(id),
    estimated_pool       INT NOT NULL DEFAULT 0,
    active_job_seekers   INT,
    avg_expected_salary  NUMERIC(12, 2),
    languages            JSONB NOT NULL DEFAULT '[]'::jsonb,
    as_of_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    created_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           VARCHAR(100),
    status               VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version              BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_candidate_supply_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_candidate_supply_dims ON candidate_supply(tenant_id, city_id, role_id);

CREATE TABLE IF NOT EXISTS recommendation_run (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recruiter_user_id   INTEGER REFERENCES users(id),
    criteria_json       JSONB NOT NULL,
    result_json         JSONB NOT NULL,
    provider            VARCHAR(40) NOT NULL DEFAULT 'RULE_BASED',
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    version             BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_recommendation_run_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS ix_recommendation_run_user
    ON recommendation_run(tenant_id, recruiter_user_id, created_date);

-- =============================================================================
-- END V1 (Node / Express)
-- =============================================================================
