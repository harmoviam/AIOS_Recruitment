import pg from 'pg';
import bcrypt from 'bcryptjs';
import { DB_SCHEMA, pool, useSchema } from './dbConfig.js';
import { migrateSourcingIntelligence } from './migrations/sourcingIntelligence.js';
import { migratePeopleSearch } from './migrations/peopleSearch.js';
import { seedMohaliSourcingPack } from './services/sourcing/seed/mohaliSeed.js';
import { candidateJoinPath, extractJoinToken, generateJoinCode, normalizeMeetingLink } from './services/livekit.js';

export { pool, DB_SCHEMA };

const allowDemoSeed = process.env.NODE_ENV !== 'production';

const TENANT_SEEDS = [
  {
    slug: 'staffpro-agency',
    name: 'StaffPro Agency',
    plan: 'pro',
    status: 'active',
    primary_color: '#2563EB',
    logo_initials: 'SP',
    features: ['whatsapp', 'ai_insights', 'automation', 'reports'],
  },
  {
    slug: 'talentbridge',
    name: 'TalentBridge Solutions',
    plan: 'enterprise',
    status: 'active',
    primary_color: '#0D9488',
    logo_initials: 'TB',
    features: ['whatsapp', 'ai_insights', 'automation', 'reports', 'ai_calling', 'sso', 'api', 'white_label'],
  },
  {
    slug: 'quickhire',
    name: 'QuickHire Staffing',
    plan: 'starter',
    status: 'trial',
    primary_color: '#7C3AED',
    logo_initials: 'QH',
    features: ['whatsapp', 'ai_insights', 'reports'],
  },
  {
    slug: 'earlyjobs',
    name: 'EarlyJobs',
    plan: 'pro',
    status: 'active',
    primary_color: '#EA580C',
    logo_initials: 'EJ',
    features: ['whatsapp', 'ai_insights', 'automation', 'reports'],
  },
];

export async function initDb() {
  const client = await pool.connect();
  try {
    await useSchema(client);
    console.log(`Using database schema: ${DB_SCHEMA}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'starter',
        status TEXT NOT NULL DEFAULT 'active',
        primary_color TEXT NOT NULL DEFAULT '#2563EB',
        logo_initials TEXT NOT NULL DEFAULT 'AI',
        features JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'recruiter',
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        client TEXT NOT NULL,
        location TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        assigned_to INTEGER REFERENCES users(id),
        open_positions INTEGER DEFAULT 1,
        description TEXT,
        tenure_days INTEGER,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS candidates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        skills JSONB NOT NULL DEFAULT '[]',
        experience_years REAL DEFAULT 0,
        ai_score REAL DEFAULT 0,
        stage TEXT NOT NULL DEFAULT 'applied',
        job_id INTEGER REFERENCES jobs(id),
        recruiter_id INTEGER REFERENCES users(id),
        notes TEXT,
        salary_expectation TEXT,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS interviews (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        scheduled_at TIMESTAMPTZ NOT NULL,
        duration_minutes INTEGER DEFAULT 60,
        round_type TEXT DEFAULT 'Technical',
        status TEXT NOT NULL DEFAULT 'pending',
        meeting_link TEXT,
        notes TEXT,
        score REAL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        is_outgoing BOOLEAN NOT NULL DEFAULT FALSE,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id),
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        PRIMARY KEY (tenant_id, key)
      );

      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        industry TEXT,
        location TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS follow_ups (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        assigned_to INTEGER REFERENCES users(id),
        due_at TIMESTAMPTZ NOT NULL,
        type TEXT NOT NULL DEFAULT 'call',
        status TEXT NOT NULL DEFAULT 'upcoming',
        notes TEXT,
        ai_suggestion TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await migratePhase1Tables(client);
    await migrateScreening(client);
    await migrateJobScreeningQuestions(client);
    await migrateFollowUpEngine(client);
    await migrateInterviewEvaluation(client);
    await migrateWhatsAppDelivery(client);
    await migrateJoinCodes(client);
    await fixStaleMeetingLinks(client);
    await migrateMultiTenant(client);
    await migrateAiResumeParser(client);
    await migrateJobRecommendation(client);
    await migrateCompanyGeo(client);
    await migratePollAssessment(client);
    await migrateEmailLog(client);
    await migrateApplications(client);
    await migrateBilling(client);
    await migrateReadinessAssessments(client);
    await migrateTenantLogo(client);
    await migrateCandidateSearch(client);
    await migratePerfIndexes(client);
    await migrateSourcingIntelligence(client);
    await migratePeopleSearch(client);
    // Campaign → careers-page publishing: a job can originate from a campaign.
    await client.query(
      `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_campaign_id UUID REFERENCES sourcing_campaign(id) ON DELETE SET NULL`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS ix_jobs_sourcing_campaign ON jobs(sourcing_campaign_id)`
    );
    if (allowDemoSeed) {
      await ensureAllTenantsSeeded(client);

      const { rows: candRows } = await client.query('SELECT COUNT(*)::int AS c FROM candidates');
      if (candRows[0].c === 0) await seedDb(client);
      else await seedPhase1Extras(client);

      await ensureTodayInterviews(client);

      const { rows: sourcingTenants } = await client.query(`SELECT id FROM tenants WHERE status != 'churned'`);
      for (const t of sourcingTenants) {
        await seedMohaliSourcingPack(client, t.id);
      }
    }
  } finally {
    client.release();
  }
}

/** Keep demo dashboards useful — ensure each tenant has interviews on the current date. */
async function ensureTodayInterviews(client: pg.PoolClient) {
  const { rows: tenants } = await client.query(
    "SELECT id FROM tenants WHERE status IN ('active', 'trial')"
  );

  const slots = [
    { h: 10, m: 0, round: 'Technical', status: 'confirmed' },
    { h: 14, m: 0, round: 'HR Round', status: 'pending' },
    { h: 16, m: 30, round: 'Final', status: 'confirmed' },
  ];

  for (const { id: tenantId } of tenants) {
    const { rows: todayCount } = await client.query(
      `SELECT COUNT(*)::int AS c FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       WHERE c.tenant_id = $1 AND i.scheduled_at::date = CURRENT_DATE`,
      [tenantId]
    );
    if (todayCount[0].c > 0) continue;

    const { rows: cands } = await client.query(
      `SELECT DISTINCT ON (c.recruiter_id) c.id
       FROM candidates c
       WHERE c.tenant_id = $1
         AND c.recruiter_id IS NOT NULL
         AND c.stage IN ('interview', 'screening', 'selected')
       ORDER BY c.recruiter_id, c.updated_at DESC
       LIMIT $2`,
      [tenantId, slots.length]
    );
    if (cands.length === 0) continue;

    for (let i = 0; i < cands.length; i++) {
      const slot = slots[i];
      await client.query(
        `INSERT INTO interviews (candidate_id, scheduled_at, round_type, status, meeting_link)
         VALUES ($1, CURRENT_DATE + make_interval(hours => $2, mins => $3), $4, $5, $6)`,
        [cands[i].id, slot.h, slot.m, slot.round, slot.status, 'https://zoom.us/j/demo']
      );
      await client.query(
        `UPDATE candidates SET stage = 'interview', updated_at = NOW()
         WHERE id = $1 AND stage IN ('applied', 'screening')`,
        [cands[i].id]
      );
    }
  }
}

async function migrateEmailLog(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS email_log (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      to_email TEXT NOT NULL,
      template TEXT NOT NULL,
      subject TEXT,
      status TEXT NOT NULL,
      provider_id TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/**
 * Candidate <-> job goes many-to-many. Per-job state (stage, score, screening,
 * offer/joining tracking) lives on applications; candidates keep identity,
 * contact, skills, and resume. candidates.job_id/stage stay as the "primary
 * application" during the transition — routes dual-write both.
 */
async function migrateApplications(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      stage TEXT NOT NULL DEFAULT 'applied',
      ai_score REAL,
      screening JSONB,
      offer_status TEXT,
      expected_joining_at TIMESTAMPTZ,
      joined_at TIMESTAMPTZ,
      recruiter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (candidate_id, job_id)
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_app_tenant_job_stage ON applications (tenant_id, job_id, stage)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_app_tenant_candidate ON applications (tenant_id, candidate_id)`
  );

  // One-time backfill from the legacy single job_id column.
  const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM applications');
  if (rows[0].c === 0) {
    await client.query(`
      INSERT INTO applications (tenant_id, candidate_id, job_id, stage, ai_score, screening,
        offer_status, expected_joining_at, joined_at, recruiter_id, source, created_at, updated_at)
      SELECT c.tenant_id, c.id, c.job_id, c.stage, c.ai_score, c.screening,
        c.offer_status, c.expected_joining_at, c.joined_at, c.recruiter_id,
        COALESCE(c.source, 'manual'), c.created_at, c.updated_at
      FROM candidates c
      JOIN jobs j ON j.id = c.job_id
      WHERE c.tenant_id IS NOT NULL
      ON CONFLICT (candidate_id, job_id) DO NOTHING
    `);
  }

  await client.query(
    `ALTER TABLE interviews ADD COLUMN IF NOT EXISTS application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL`
  );
  await client.query(
    `ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL`
  );
  // Attach existing rows to the candidate's primary application.
  await client.query(`
    UPDATE interviews i SET application_id = a.id
    FROM candidates c
    JOIN applications a ON a.candidate_id = c.id AND a.job_id = c.job_id
    WHERE i.candidate_id = c.id AND i.application_id IS NULL
  `);
  await client.query(`
    UPDATE follow_ups f SET application_id = a.id
    FROM candidates c
    JOIN applications a ON a.candidate_id = c.id AND a.job_id = c.job_id
    WHERE f.candidate_id = c.id AND f.application_id IS NULL
  `);
}

async function migrateBilling(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS billing_payments (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      razorpay_order_id TEXT UNIQUE NOT NULL,
      razorpay_payment_id TEXT UNIQUE,
      plan TEXT NOT NULL,
      cycle TEXT NOT NULL,
      amount_inr NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    )
  `);
  await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gstin TEXT`);
  // Existing trial tenants predate trial tracking — give them a fresh window.
  await client.query(
    `UPDATE tenants SET trial_ends_at = NOW() + INTERVAL '14 days'
     WHERE status = 'trial' AND trial_ends_at IS NULL`
  );
}

/** Public AI Hiring Readiness self-assessment submissions — sales leads, not tenant data. */
async function migrateReadinessAssessments(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS readiness_assessments (
      id SERIAL PRIMARY KEY,
      org_name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      answers JSONB NOT NULL,
      total_score INTEGER NOT NULL,
      tier TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Firmographics + optional deeper-picture answers (sponsorship/compliance/integration).
  await client.query(`ALTER TABLE readiness_assessments ADD COLUMN IF NOT EXISTS company_size TEXT`);
  await client.query(`ALTER TABLE readiness_assessments ADD COLUMN IF NOT EXISTS hires_per_month TEXT`);
  await client.query(`ALTER TABLE readiness_assessments ADD COLUMN IF NOT EXISTS industry TEXT`);
  await client.query(`ALTER TABLE readiness_assessments ADD COLUMN IF NOT EXISTS extras JSONB`);
}

async function migrateTenantLogo(client: pg.PoolClient) {
  await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_path TEXT`);
}

async function migrateCandidateSearch(client: pg.PoolClient) {
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_text TEXT`);
  await client.query(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(email, '') || ' ' || coalesce(phone, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(skills::text, '')), 'B') ||
        setweight(to_tsvector('english', left(coalesce(resume_text, ''), 100000)), 'C')
      ) STORED
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_cand_search ON candidates USING GIN (search_tsv)`
  );
}

async function migratePerfIndexes(client: pg.PoolClient) {
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_cand_tenant_updated ON candidates (tenant_id, updated_at DESC)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_cand_tenant_stage ON candidates (tenant_id, stage)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_cand_tenant_recruiter ON candidates (tenant_id, recruiter_id)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_messages_candidate ON messages (candidate_id, sent_at DESC)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_followups_tenant_due ON follow_ups (tenant_id, status, due_at)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_activities_tenant_created ON activities (tenant_id, created_at DESC)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON interviews (candidate_id, scheduled_at)`
  );
}

async function migratePhase1Tables(client: pg.PoolClient) {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata'`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_signature TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hm_notes TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_hot BOOLEAN NOT NULL DEFAULT FALSE`);
  // activities.candidate_id originally lacked ON DELETE CASCADE (every other
  // table referencing candidates has it), so deleting a candidate with history
  // failed with an FK violation. Rewrite the constraint in place if needed.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('activities')
          AND conname = 'activities_candidate_id_fkey'
          AND confdeltype <> 'c'
      ) THEN
        ALTER TABLE activities DROP CONSTRAINT activities_candidate_id_fkey;
        ALTER TABLE activities ADD CONSTRAINT activities_candidate_id_fkey
          FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

async function migrateScreening(client: pg.PoolClient) {
  // Pre-screening scorecard filled by recruiters during the first call:
  // question scores, red-flag signal scores, computed totals and risk level.
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening JSONB`);
}

async function migrateJobScreeningQuestions(client: pg.PoolClient) {
  // JD-derived screening question templates: pre-screen + interview scorecard.
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS screening_questions JSONB`);
}

async function migrateWhatsAppDelivery(client: pg.PoolClient) {
  await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_status TEXT`);
  await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_error TEXT`);
}

async function migrateInterviewEvaluation(client: pg.PoolClient) {
  // Structured BPO/CRM screening questions scored 1–5 during the interview call.
  await client.query(`ALTER TABLE interviews ADD COLUMN IF NOT EXISTS evaluation JSONB`);
}

async function migrateJoinCodes(client: pg.PoolClient) {
  await client.query(`ALTER TABLE interviews ADD COLUMN IF NOT EXISTS join_code TEXT`);
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS interviews_join_code_uidx ON interviews (join_code) WHERE join_code IS NOT NULL`
  );

  const base = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
  const linkBase = base && !base.includes('localhost') ? base : 'http://localhost:5174';

  const { rows } = await client.query<{ id: number; join_code: string | null; meeting_link: string | null }>(
    `SELECT id, join_code, meeting_link FROM interviews`
  );

  for (const row of rows) {
    const token = row.meeting_link ? extractJoinToken(row.meeting_link) : null;
    const hasJwtLink = Boolean(token?.includes('.'));

    if (!row.join_code && token && !hasJwtLink) {
      await client.query('UPDATE interviews SET join_code = $1 WHERE id = $2', [token, row.id]);
      row.join_code = token;
    }

    if (row.join_code && !hasJwtLink) continue;

    const joinCode = row.join_code || generateJoinCode();
    let meetingLink = row.meeting_link;

    if (row.meeting_link) {
      try {
        const origin = new URL(row.meeting_link).origin;
        meetingLink = candidateJoinPath(joinCode, origin);
      } catch {
        meetingLink = candidateJoinPath(joinCode, linkBase);
      }
    } else {
      meetingLink = candidateJoinPath(joinCode, linkBase);
    }

    await client.query('UPDATE interviews SET join_code = $1, meeting_link = $2 WHERE id = $3', [
      joinCode,
      meetingLink,
      row.id,
    ]);
  }
}

async function fixStaleMeetingLinks(client: pg.PoolClient) {
  const base = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (!base || base.includes('localhost')) return;

  const { rows } = await client.query<{ id: number; meeting_link: string }>(
    `SELECT id, meeting_link FROM interviews
     WHERE meeting_link IS NOT NULL
       AND (meeting_link LIKE '%localhost%' OR meeting_link LIKE '%127.0.0.1%')`
  );

  for (const row of rows) {
    const normalized = normalizeMeetingLink(row.meeting_link, base);
    if (normalized && normalized !== row.meeting_link) {
      await client.query('UPDATE interviews SET meeting_link = $1 WHERE id = $2', [normalized, row.id]);
    }
  }
}

async function migrateFollowUpEngine(client: pg.PoolClient) {
  // Candidate lifecycle fields used by the follow-up rules engine
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS expected_joining_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offer_status TEXT`);
  await client.query(`UPDATE candidates SET joined_at = updated_at WHERE stage = 'joined' AND joined_at IS NULL`);

  // Placement tenure drives the post-joining check-in schedule
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tenure_days INTEGER`);

  // Rule metadata on follow-ups
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'manual'`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS outcome TEXT`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS interview_id INTEGER REFERENCES interviews(id) ON DELETE CASCADE`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS milestone_day INTEGER`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES follow_ups(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS whatsapp_message TEXT`);
  await client.query(`CREATE INDEX IF NOT EXISTS follow_ups_rule_idx ON follow_ups (tenant_id, candidate_id, category)`);

  await client.query(`ALTER TABLE interviews ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await client.query(`
    UPDATE interviews i
    SET created_by = a.user_id
    FROM activities a
    WHERE i.created_by IS NULL
      AND a.candidate_id = i.candidate_id
      AND a.type = 'interview'
      AND a.user_id IS NOT NULL
      AND a.created_at BETWEEN i.created_at - INTERVAL '30 seconds' AND i.created_at + INTERVAL '30 seconds'
  `);

  // Remove duplicate rule-generated rows (e.g. parallel sync on page load).
  await client.query(`
    DELETE FROM follow_ups a
    USING follow_ups b
    WHERE a.id > b.id
      AND a.tenant_id = b.tenant_id
      AND a.interview_id IS NOT NULL
      AND a.interview_id = b.interview_id
      AND a.category = b.category
  `);
  await client.query(`
    DELETE FROM follow_ups a
    USING follow_ups b
    WHERE a.id > b.id
      AND a.tenant_id = b.tenant_id
      AND a.category = 'onboarding'
      AND b.category = 'onboarding'
      AND a.candidate_id = b.candidate_id
      AND a.milestone_day = b.milestone_day
  `);
  await client.query(`
    DELETE FROM follow_ups a
    USING follow_ups b
    WHERE a.id > b.id
      AND a.tenant_id = b.tenant_id
      AND a.category = 'offer_followup'
      AND b.category = 'offer_followup'
      AND a.candidate_id = b.candidate_id
      AND a.milestone_day IS NULL
      AND b.milestone_day IS NULL
      AND a.completed_at IS NULL
      AND b.completed_at IS NULL
      AND a.status NOT IN ('completed', 'missed')
      AND b.status NOT IN ('completed', 'missed')
  `);
  await client.query(`
    DELETE FROM follow_ups a
    USING follow_ups b
    WHERE a.id > b.id
      AND a.tenant_id = b.tenant_id
      AND a.category = 'offer_followup'
      AND b.category = 'offer_followup'
      AND a.candidate_id = b.candidate_id
      AND a.milestone_day IS NOT NULL
      AND a.milestone_day = b.milestone_day
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_interview_rule_uidx
      ON follow_ups (tenant_id, interview_id, category)
      WHERE interview_id IS NOT NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_onboarding_uidx
      ON follow_ups (tenant_id, candidate_id, milestone_day)
      WHERE category = 'onboarding' AND milestone_day IS NOT NULL
  `);
  // Offer follow-ups come in two shapes: milestone reminders keyed to the
  // expected joining date (milestone_day -7 / -1 / 0) and a generic chase used
  // until a joining date is known (milestone_day IS NULL). The old single-open
  // index would block the milestone plan, so scope it to chase rows only.
  await client.query(`DROP INDEX IF EXISTS follow_ups_offer_open_uidx`);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_offer_milestone_uidx
      ON follow_ups (tenant_id, candidate_id, milestone_day)
      WHERE category = 'offer_followup' AND milestone_day IS NOT NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_offer_chase_uidx
      ON follow_ups (tenant_id, candidate_id)
      WHERE category = 'offer_followup'
        AND milestone_day IS NULL
        AND completed_at IS NULL
        AND status NOT IN ('completed', 'missed')
  `);

  // Candidates with active interviews belong on the Interview Scheduled pipeline column.
  await client.query(`
    UPDATE candidates c
    SET stage = 'interview', updated_at = NOW()
    WHERE c.stage IN ('applied', 'screening')
      AND EXISTS (
        SELECT 1 FROM interviews i
        WHERE i.candidate_id = c.id
          AND i.status IN ('pending', 'confirmed')
      )
  `);
}

async function seedPhase1Extras(client: pg.PoolClient) {
  const { rows: tenants } = await client.query("SELECT id FROM tenants WHERE slug = 'staffpro-agency' LIMIT 1");
  const staffpro = tenants[0]?.id;
  if (!staffpro) return;

  const { rows: coCount } = await client.query('SELECT COUNT(*)::int AS c FROM companies WHERE tenant_id = $1', [staffpro]);
  if (coCount[0].c === 0) await seedCompaniesAndFollowUps(client, staffpro, null, null, null);
  else {
    const { rows: fuCount } = await client.query('SELECT COUNT(*)::int AS c FROM follow_ups WHERE tenant_id = $1', [staffpro]);
    if (fuCount[0].c === 0) {
      const u2 = (await client.query("SELECT id FROM users WHERE email = 'priya@aios.com' AND tenant_id = $1", [staffpro])).rows[0]?.id;
      await seedFollowUpsOnly(client, staffpro, u2);
    }
  }

  const { rows: tcsCo } = await client.query(
    "SELECT id FROM companies WHERE tenant_id = $1 AND name = 'TCS' LIMIT 1",
    [staffpro]
  );
  if (tcsCo[0]) {
    await client.query(
      "UPDATE users SET company_id = $1 WHERE tenant_id = $2 AND email IN ('priya@aios.com', 'rohit@aios.com') AND role = 'recruiter'",
      [tcsCo[0].id, staffpro]
    );
    const hm = await client.query(
      "SELECT id FROM users WHERE email = 'anil.mehta@client.com' AND tenant_id = $1",
      [staffpro]
    );
    if (hm.rows[0]) {
      await client.query(
        "UPDATE users SET managed_by_id = $1 WHERE tenant_id = $2 AND email IN ('priya@aios.com', 'rohit@aios.com') AND role = 'recruiter'",
        [hm.rows[0].id, staffpro]
      );
    }
  }

  const hmExists = await client.query(
    "SELECT id FROM users WHERE email = 'anil.mehta@client.com' AND tenant_id = $1",
    [staffpro]
  );
  if (hmExists.rows.length === 0) {
    const hash = bcrypt.hashSync('password123', 10);
    const { rows: cos } = await client.query('SELECT id FROM companies WHERE tenant_id = $1 LIMIT 1', [staffpro]);
    if (cos[0]) {
      await client.query(
        `INSERT INTO users (email, password_hash, name, role, tenant_id, company_id) VALUES ($1, $2, 'Anil Mehta', 'hiring_manager', $3, $4)`,
        ['anil.mehta@client.com', hash, staffpro, cos[0].id]
      );
    }
  }
}

async function migrateMultiTenant(client: pg.PoolClient) {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
  await client.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);

  const { rows: tenantCount } = await client.query('SELECT COUNT(*)::int AS c FROM tenants');
  if (allowDemoSeed && tenantCount[0].c === 0) {
    for (const t of TENANT_SEEDS) {
      await client.query(
        `INSERT INTO tenants (slug, name, plan, status, primary_color, logo_initials, features)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [t.slug, t.name, t.plan, t.status, t.primary_color, t.logo_initials, JSON.stringify(t.features)]
      );
    }
  }

  const { rows: defaultTenant } = await client.query(
    "SELECT id FROM tenants WHERE slug = 'staffpro-agency' LIMIT 1"
  );
  const defaultId = defaultTenant[0]?.id;
  if (!defaultId) return;

  await client.query('UPDATE users SET tenant_id = $1 WHERE tenant_id IS NULL AND role != $2', [
    defaultId,
    'super_admin',
  ]);
  await client.query('UPDATE jobs SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultId]);
  await client.query('UPDATE candidates SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultId]);
  await client.query('UPDATE activities SET tenant_id = $1 WHERE tenant_id IS NULL', [defaultId]);

  await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key');
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx
    ON users (tenant_id, email) WHERE tenant_id IS NOT NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_platform_email_idx
    ON users (email) WHERE tenant_id IS NULL
  `);

  const settingsCols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'settings' AND column_name = 'tenant_id'`,
    [DB_SCHEMA]
  );
  if (settingsCols.rows.length === 0) {
    const legacy = await client.query('SELECT key, value FROM settings');
    await client.query('DROP TABLE IF EXISTS settings');
    await client.query(`
      CREATE TABLE settings (
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        PRIMARY KEY (tenant_id, key)
      )
    `);
    for (const row of legacy.rows) {
      await client.query('INSERT INTO settings (tenant_id, key, value) VALUES ($1, $2, $3)', [
        defaultId,
        row.key,
        row.value,
      ]);
    }
  }

  await dedupeJobsByTitle(client);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_title_idx
    ON jobs (tenant_id, title)
  `);
  if (allowDemoSeed) {
    await ensureDemoUsers(client, defaultId);
  }
}

/** Merge duplicate job rows (same tenant + title) created by concurrent initDb runs. */
async function dedupeJobsByTitle(client: pg.PoolClient) {
  await client.query(`
    WITH ranked AS (
      SELECT id, MIN(id) OVER (PARTITION BY tenant_id, title) AS keep_id
      FROM jobs
    )
    UPDATE candidates c
    SET job_id = r.keep_id
    FROM ranked r
    WHERE c.job_id = r.id AND r.id != r.keep_id
  `);
  await client.query(`
    DELETE FROM jobs j
    USING (
      SELECT tenant_id, title, MIN(id) AS keep_id
      FROM jobs
      GROUP BY tenant_id, title
      HAVING COUNT(*) > 1
    ) d
    WHERE j.tenant_id = d.tenant_id AND j.title = d.title AND j.id != d.keep_id
  `);
}

/** Company geo — lat/lng and structured address for nearby-company ranking. */
async function migrateCompanyGeo(client: pg.PoolClient) {
  await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS latitude REAL`);
  await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS longitude REAL`);
  await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT`);
  await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT`);
  await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS state TEXT`);
  await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS country TEXT`);
  await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pincode TEXT`);
  await client.query(`
    CREATE INDEX IF NOT EXISTS companies_geo_tenant_idx
    ON companies (tenant_id, status)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `);
}

/** Job recommendation engine — geo coordinates and matching criteria on jobs & candidates. */
async function migrateJobRecommendation(client: pg.PoolClient) {
  // Candidate screening / matching fields
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS latitude REAL`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS longitude REAL`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS relocation_allowed BOOLEAN NOT NULL DEFAULT FALSE`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS age INTEGER`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS highest_qualification TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS specialization TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_job_type TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_shift TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_cities JSONB DEFAULT '[]'`);

  // Job location & requirement fields
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS latitude REAL`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS longitude REAL`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS city TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS state TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pincode TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_qualification TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_languages JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_age INTEGER`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_age INTEGER`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_experience REAL`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_experience REAL`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_skills JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shift TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT`);
  await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gender_preference TEXT`);

  await client.query(`
    CREATE INDEX IF NOT EXISTS jobs_active_tenant_idx
    ON jobs (tenant_id, status)
    WHERE status IN ('active', 'urgent', 'open')
  `);
}

/** Recruiter Poll & Assessment — tenant-scoped learning engagement module. */
async function migratePollAssessment(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS poll_recruiters (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      mobile TEXT NOT NULL,
      company_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS poll_questions (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      option1 TEXT NOT NULL,
      option2 TEXT NOT NULL,
      option3 TEXT NOT NULL,
      option4 TEXT NOT NULL,
      correct_option INTEGER NOT NULL CHECK (correct_option BETWEEN 1 AND 4),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS poll_responses (
      id SERIAL PRIMARY KEY,
      recruiter_id INTEGER NOT NULL REFERENCES poll_recruiters(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
      selected_option INTEGER NOT NULL CHECK (selected_option BETWEEN 1 AND 4),
      is_correct BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (recruiter_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS poll_results (
      id SERIAL PRIMARY KEY,
      recruiter_id INTEGER NOT NULL UNIQUE REFERENCES poll_recruiters(id) ON DELETE CASCADE,
      score INTEGER NOT NULL DEFAULT 0,
      percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('pass', 'fail')),
      total_questions INTEGER NOT NULL DEFAULT 0,
      correct_answers INTEGER NOT NULL DEFAULT 0,
      wrong_answers INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(`ALTER TABLE poll_recruiters ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
  await client.query(`ALTER TABLE poll_questions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);

  // Backfill legacy global rows onto the primary demo tenant (or first active tenant).
  const { rows: defaultTenant } = await client.query(
    `SELECT id FROM tenants
     WHERE slug = 'staffpro-agency' OR status IN ('active', 'trial')
     ORDER BY CASE WHEN slug = 'staffpro-agency' THEN 0 ELSE 1 END, id
     LIMIT 1`
  );
  const defaultTenantId = defaultTenant[0]?.id as number | undefined;
  if (defaultTenantId) {
    await client.query(`UPDATE poll_recruiters SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
    await client.query(`UPDATE poll_questions SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
  }

  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND table_name = 'poll_recruiters'
          AND constraint_name = 'poll_recruiters_email_key'
      ) THEN
        ALTER TABLE poll_recruiters DROP CONSTRAINT poll_recruiters_email_key;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND table_name = 'poll_recruiters'
          AND constraint_name = 'poll_recruiters_mobile_key'
      ) THEN
        ALTER TABLE poll_recruiters DROP CONSTRAINT poll_recruiters_mobile_key;
      END IF;
    END $$;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS poll_recruiters_tenant_email_uidx
      ON poll_recruiters (tenant_id, email);
    CREATE UNIQUE INDEX IF NOT EXISTS poll_recruiters_tenant_mobile_uidx
      ON poll_recruiters (tenant_id, mobile);
    CREATE INDEX IF NOT EXISTS poll_recruiters_tenant_idx ON poll_recruiters (tenant_id);
    CREATE INDEX IF NOT EXISTS poll_questions_tenant_idx ON poll_questions (tenant_id);
  `);

  // Multi-poll: parent polls table + poll_id on questions/recruiters
  await client.query(`
    CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, slug)
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS polls_tenant_idx ON polls (tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS polls_tenant_status_idx ON polls (tenant_id, status)`);

  await client.query(`ALTER TABLE poll_questions ADD COLUMN IF NOT EXISTS poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE`);
  await client.query(`ALTER TABLE poll_recruiters ADD COLUMN IF NOT EXISTS poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE`);

  // Ensure every active/trial tenant (and any with orphan poll rows) has a default poll.
  const { rows: tenantsNeedingPoll } = await client.query(
    `SELECT t.id
     FROM tenants t
     WHERE t.status IN ('active', 'trial')
        OR EXISTS (SELECT 1 FROM poll_questions q WHERE q.tenant_id = t.id)
        OR EXISTS (SELECT 1 FROM poll_recruiters r WHERE r.tenant_id = t.id)
     ORDER BY t.id`
  );
  for (const t of tenantsNeedingPoll) {
    const { rows: existing } = await client.query(
      `SELECT id FROM polls WHERE tenant_id = $1 AND is_default = TRUE LIMIT 1`,
      [t.id]
    );
    let pollId = existing[0]?.id as number | undefined;
    if (!pollId) {
      const { rows: bySlug } = await client.query(
        `SELECT id FROM polls WHERE tenant_id = $1 AND slug = 'default' LIMIT 1`,
        [t.id]
      );
      pollId = bySlug[0]?.id as number | undefined;
    }
    if (!pollId) {
      const { rows: created } = await client.query(
        `INSERT INTO polls (tenant_id, title, slug, description, status, is_default)
         VALUES ($1, 'Recruiter Poll', 'default', NULL, 'open', TRUE)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET is_default = TRUE
         RETURNING id`,
        [t.id]
      );
      pollId = created[0].id as number;
    }
    await client.query(
      `UPDATE poll_questions SET poll_id = $1 WHERE tenant_id = $2 AND poll_id IS NULL`,
      [pollId, t.id]
    );
    await client.query(
      `UPDATE poll_recruiters SET poll_id = $1 WHERE tenant_id = $2 AND poll_id IS NULL`,
      [pollId, t.id]
    );
  }

  // Drop tenant-level uniqueness; uniqueness is per poll.
  await client.query(`DROP INDEX IF EXISTS poll_recruiters_tenant_email_uidx`);
  await client.query(`DROP INDEX IF EXISTS poll_recruiters_tenant_mobile_uidx`);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS poll_recruiters_poll_email_uidx
      ON poll_recruiters (poll_id, email);
    CREATE UNIQUE INDEX IF NOT EXISTS poll_recruiters_poll_mobile_uidx
      ON poll_recruiters (poll_id, mobile);
    CREATE INDEX IF NOT EXISTS poll_questions_poll_idx ON poll_questions (poll_id);
    CREATE INDEX IF NOT EXISTS poll_recruiters_poll_idx ON poll_recruiters (poll_id);
  `);

  // Seed questions onto default poll only when that poll still has zero questions.
  await seedPollQuestionsForDefaultPolls(client);
}

const POLL_QUESTION_SEEDS: Array<{
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correct_option: number;
  sort_order: number;
}> = [
  {
    question: 'Which sourcing strategy gives the best hiring results?',
    option1: 'One Job Portal',
    option2: 'Employee Referrals Only',
    option3: 'Walk-ins Only',
    option4: 'Multiple Sourcing Channels (WhatsApp, Referrals, LinkedIn, Colleges & Job Portals)',
    correct_option: 4,
    sort_order: 1,
  },
  {
    question: 'What improves interview attendance the most?',
    option1: 'Higher Salary',
    option2: 'More Job Advertisements',
    option3: 'Longer Job Descriptions',
    option4: 'Consistent Follow-up with Candidates',
    correct_option: 4,
    sort_order: 2,
  },
  {
    question: 'What should be the primary KPI for recruiters?',
    option1: 'Number of Resumes',
    option2: 'Number of Interviews',
    option3: 'Number of Offers',
    option4: 'Joining Ratio & Retention',
    correct_option: 4,
    sort_order: 3,
  },
  {
    question: "A candidate rejects today's offer. What should a recruiter do?",
    option1: 'Delete the Profile',
    option2: 'Ignore Future Communication',
    option3: 'Block the Candidate',
    option4: 'Keep them in the Talent Pipeline',
    correct_option: 4,
    sort_order: 4,
  },
  {
    question: 'Candidates usually accept a BPO offer because of:',
    option1: 'Salary Only',
    option2: 'Office Location Only',
    option3: 'Brand Name Only',
    option4: 'Salary + Career Growth + Shift + Transport + Work Culture',
    correct_option: 4,
    sort_order: 5,
  },
  {
    question: 'Freshers should mainly be evaluated based on:',
    option1: 'Resume Design',
    option2: 'College Reputation',
    option3: 'Degree Only',
    option4: 'Communication Skills + Aptitude + Attitude',
    correct_option: 4,
    sort_order: 6,
  },
  {
    question: 'When is hiring considered complete?',
    option1: 'Resume Shortlisted',
    option2: 'Interview Completed',
    option3: 'Offer Letter Sent',
    option4: 'Candidate Joins & Completes Onboarding',
    correct_option: 4,
    sort_order: 7,
  },
  {
    question: 'What should recruiters spend most of their time doing?',
    option1: 'Waiting for Applications',
    option2: 'Posting Jobs Repeatedly',
    option3: 'Updating Excel Sheets',
    option4: 'Sourcing, Engaging & Following Up with Candidates',
    correct_option: 4,
    sort_order: 8,
  },
  {
    question: 'Which recruiter will achieve the highest joining ratio?',
    option1: 'Recruiter using only one Job Portal',
    option2: 'Recruiter calling candidates once',
    option3: 'Recruiter offering only higher salary',
    option4: 'Recruiter who consistently follows up and builds relationships',
    correct_option: 4,
    sort_order: 9,
  },
  {
    question: 'Which statement best defines an excellent recruiter?',
    option1: 'Closes positions quickly',
    option2: 'Conducts the most interviews',
    option3: 'Sends the most offers',
    option4: 'Builds relationships, talent pipelines, and quality hires',
    correct_option: 4,
    sort_order: 10,
  },
];

async function seedPollQuestionsForPoll(client: pg.PoolClient, tenantId: number, pollId: number) {
  const { rows } = await client.query(
    'SELECT COUNT(*)::int AS c FROM poll_questions WHERE poll_id = $1',
    [pollId]
  );
  if (rows[0].c > 0) return 0;

  for (const q of POLL_QUESTION_SEEDS) {
    await client.query(
      `INSERT INTO poll_questions
        (tenant_id, poll_id, question, option1, option2, option3, option4, correct_option, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
      [tenantId, pollId, q.question, q.option1, q.option2, q.option3, q.option4, q.correct_option, q.sort_order]
    );
  }
  return POLL_QUESTION_SEEDS.length;
}

/** Legacy migration helper: seed default poll only when it has no questions yet. */
async function seedPollQuestionsForDefaultPolls(client: pg.PoolClient) {
  const { rows: polls } = await client.query(
    `SELECT id, tenant_id FROM polls WHERE is_default = TRUE ORDER BY id`
  );
  let seeded = 0;
  for (const p of polls) {
    const count = await seedPollQuestionsForPoll(client, p.tenant_id, p.id);
    if (count > 0) seeded += 1;
  }
  if (seeded > 0) {
    console.log(`Seeded poll assessment questions for ${seeded} default poll(s)`);
  }
}

/** AI resume parser — structured profile fields and resume file metadata on candidates. */
async function migrateAiResumeParser(client: pg.PoolClient) {
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS parsed_profile JSONB`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_meta JSONB`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS github TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS portfolio TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_company TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_location TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_location TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notice_period TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_salary TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS professional_summary TEXT`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS projects JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS languages JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS technical_skills JSONB DEFAULT '[]'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS soft_skills JSONB DEFAULT '[]'`);
}

async function ensureAllTenantsSeeded(client: pg.PoolClient) {
  for (const t of TENANT_SEEDS) {
    await client.query(
      `INSERT INTO tenants (slug, name, plan, status, primary_color, logo_initials, features)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (slug) DO NOTHING`,
      [t.slug, t.name, t.plan, t.status, t.primary_color, t.logo_initials, JSON.stringify(t.features)]
    );
  }
}

/** Sync EarlyJobs org users to match scripts/seed-earlyjobs-users.sql (dev only). */
async function ensureEarlyJobsTeamUsers(client: pg.PoolClient, ejId: number, defaultHash: string) {
  const hashAdmin = '$2a$10$oSr9QtcMxh2tvuxpKfEPyuc2WfEceQbYJeVhBLpeSsh.A6V7dGWEu'; // passwordJyoti@123
  const hashHm = '$2a$10$.5gcWHY8Z/o3omL/KQ6z.eIwX9Bc9CHhPKO/T0a8l4c1.S4wLgVTq'; // HM@123
  const hashRecruiter = '$2a$10$M7m/QNN/NjPrUWMPNBRYbe6sKLfBF57MbXEM6kVdbB/ucHB4m7tJq'; // Password@123

  const ensureCompany = async (name: string) => {
    const { rows } = await client.query(
      `SELECT id FROM companies WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
      [ejId, name]
    );
    if (rows[0]) return rows[0].id as number;
    const { rows: inserted } = await client.query(
      `INSERT INTO companies (tenant_id, name, industry, location, status)
       VALUES ($1, $2, 'Staffing', 'India', 'active') RETURNING id`,
      [ejId, name]
    );
    return inserted[0].id as number;
  };

  const companyA = await ensureCompany('EarlyJobs Desk A');
  const companyB = await ensureCompany('EarlyJobs Desk B');

  const upsert = async (
    email: string,
    passwordHash: string,
    name: string,
    role: string,
    managedById: number | null = null,
    companyId: number | null = null
  ) => {
    // Prefer the exact-case row: case-only duplicates can exist, and updating a
    // variant to the canonical email would hit the unique (tenant_id, email) index.
    const { rows } = await client.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = lower($2)
       ORDER BY (email = $2) DESC, id LIMIT 1`,
      [ejId, email]
    );
    if (rows[0]) {
      await client.query(
        `UPDATE users
         SET email = $1, password_hash = $2, name = $3, role = $4, managed_by_id = $5, company_id = $6
         WHERE id = $7`,
        [email, passwordHash, name, role, managedById, companyId, rows[0].id]
      );
      return rows[0].id as number;
    }
    const { rows: inserted } = await client.query(
      `INSERT INTO users (email, password_hash, name, role, tenant_id, managed_by_id, company_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [email, passwordHash, name, role, ejId, managedById, companyId]
    );
    return inserted[0].id as number;
  };

  await upsert('admin@earlyjobs.com', defaultHash, 'EarlyJobs Admin', 'admin');
  await upsert('jyoti@earlyjobs.in', hashAdmin, 'Jyoti', 'admin');
  const moumitaId = await upsert('moumita@earlyjobs.in', hashHm, 'Moumita', 'hiring_manager', null, companyA);
  const nidhiId = await upsert('nidhi@earlyjobs.in', hashHm, 'Nidhi', 'hiring_manager', null, companyB);
  await upsert('smruti@earlyjobs.in', hashRecruiter, 'Smruti', 'recruiter', nidhiId, companyB);
  await upsert('vidhi@earlyjobs.in', hashRecruiter, 'Vidhi', 'recruiter', moumitaId, companyA);
}

async function ensureDemoUsers(client: pg.PoolClient, staffproId: number) {
  const hash = bcrypt.hashSync('password123', 10);

  const superExists = await client.query(
    "SELECT id FROM users WHERE email = 'super@aios.com' AND tenant_id IS NULL"
  );
  if (superExists.rows.length === 0) {
    await client.query(
      `INSERT INTO users (email, password_hash, name, role, tenant_id) VALUES ($1, $2, 'Platform Admin', 'super_admin', NULL)`,
      ['super@aios.com', hash]
    );
  }

  const { rows: tb } = await client.query("SELECT id FROM tenants WHERE slug = 'talentbridge'");
  if (tb[0]) {
    const tbAdmin = await client.query(
      "SELECT id FROM users WHERE email = 'admin@talentbridge.com' AND tenant_id = $1",
      [tb[0].id]
    );
    if (tbAdmin.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, name, role, tenant_id) VALUES ($1, $2, 'TalentBridge Admin', 'admin', $3)`,
        ['admin@talentbridge.com', hash, tb[0].id]
      );
    }
  }

  // Ensure staffpro users have correct tenant_id
  await client.query(
    "UPDATE users SET tenant_id = $1 WHERE email IN ('admin@aios.com', 'priya@aios.com', 'rohit@aios.com') AND (tenant_id IS NULL OR tenant_id != $1)",
    [staffproId]
  );

  const { rows: ej } = await client.query("SELECT id FROM tenants WHERE slug = 'earlyjobs'");
  if (ej[0]) {
    const ejId = ej[0].id;
    // Legacy rename; skip when the target email already exists (unique index).
    await client.query(
      `UPDATE users SET email = 'moumita@earlyjobs.in', name = 'Moumita'
       WHERE email = 'ravi@earlyjobs.com' AND tenant_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM users u2
           WHERE u2.tenant_id = $1 AND lower(u2.email) = 'moumita@earlyjobs.in'
         )`,
      [ejId]
    );
    await ensureEarlyJobsTeamUsers(client, ejId, hash);
    const settingsExists = await client.query(
      'SELECT 1 FROM settings WHERE tenant_id = $1 LIMIT 1',
      [ejId]
    );
    if (settingsExists.rows.length === 0) {
      await client.query(
        `INSERT INTO settings (tenant_id, key, value) VALUES
          ($1, 'whatsapp', '{"connected": true, "phone": "+91 90000 00002", "businessName": "EarlyJobs"}'),
          ($1, 'branding', '{"companyName": "EarlyJobs", "primaryColor": "#EA580C"}')`,
        [ejId]
      );
    }

    const { rows: adminUser } = await client.query(
      "SELECT id FROM users WHERE tenant_id = $1 AND email = 'admin@earlyjobs.com' LIMIT 1",
      [ejId]
    );
    const ejAdminId = adminUser[0]?.id;

    if (ejAdminId) {
      const earlyJobs = [
        ['Telecaller', 'VGM Consultants Limited', 'Noida'],
        ['Telecaller- Mohali', 'VGM Consultants Limited', 'Mohali'],
        ['Tele Sales Associate', 'VGM Consultants Limited', 'Mohali'],
        ['Telemarketing Executive', 'VGM Consultants Limited', 'Mohali'],
        ['Business Development Associate- Remote', 'VGM Consultants Limited', 'Remote'],
        ['Virtual Relationship Manager', 'VGM Consultants Limited', 'Remote'],
        ['Customer Care Executives for Voice process', 'VGM Consultants Limited', 'Mohali'],
      ];
      for (const [title, clientName, location] of earlyJobs) {
        await client.query(
          `INSERT INTO jobs (title, client, location, status, assigned_to, open_positions, description, tenant_id)
           VALUES ($1, $2, $3, 'active', $4, 1, $5, $6)
           ON CONFLICT (tenant_id, title) DO NOTHING`,
          [title, clientName, location, ejAdminId, `Open position: ${title}`, ejId]
        );
      }
    }
  }
}

async function seedDb(client: pg.PoolClient) {
  const hash = bcrypt.hashSync('password123', 10);

  const { rows: tenants } = await client.query('SELECT id, slug FROM tenants ORDER BY id');
  const staffpro = tenants.find((t) => t.slug === 'staffpro-agency')?.id ?? tenants[0].id;
  const talentbridge = tenants.find((t) => t.slug === 'talentbridge')?.id;

  const upsertUser = async (
    email: string,
    name: string,
    role: string,
    tenantId: number | null
  ) => {
    const existing = await client.query(
      tenantId == null
        ? 'SELECT id FROM users WHERE email = $1 AND tenant_id IS NULL'
        : 'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
      tenantId == null ? [email] : [email, tenantId]
    );
    if (existing.rows.length > 0) return existing.rows[0].id as number;
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, name, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [email, hash, name, role, tenantId]
    );
    return rows[0].id as number;
  };

  await upsertUser('super@aios.com', 'Platform Admin', 'super_admin', null);
  const u1 = await upsertUser('admin@aios.com', 'Anil Kumar', 'admin', staffpro);
  const u2 = await upsertUser('priya@aios.com', 'Priya Verma', 'recruiter', staffpro);
  const u3 = await upsertUser('rohit@aios.com', 'Rohit Singh', 'recruiter', staffpro);
  if (talentbridge) {
    await upsertUser('admin@talentbridge.com', 'TalentBridge Admin', 'admin', talentbridge);
  }

  const { rows: jobCount } = await client.query('SELECT COUNT(*)::int AS c FROM jobs');
  if (jobCount[0].c > 0) return;

  const jobs = await client.query(
    `INSERT INTO jobs (title, client, location, status, assigned_to, open_positions, description, tenant_id) VALUES
      ('Java Developer', 'TCS', 'Mumbai', 'active', $1, 3, 'Spring Boot, microservices, AWS', $4),
      ('Python Backend Engineer', 'Infosys', 'Bangalore', 'active', $2, 2, 'Django, FastAPI, PostgreSQL', $4),
      ('UI/UX Designer', 'Thoughtworks', 'Pune', 'urgent', $3, 1, 'Figma, design systems, user research', $4)
     RETURNING id`,
    [u1, u2, u3, staffpro]
  );
  const [j1, j2, j3] = jobs.rows.map((r) => r.id);

  const candidates = [
    ['Rajesh Patel', 'rajesh@email.com', '+91 98765 43210', ['Java', 'Spring', 'AWS'], 5, 8.2, 'applied', j1, u1, '18-22 LPA'],
    ['Neha Sharma', 'neha@email.com', '+91 98765 43211', ['Java', 'Hibernate'], 4, 7.9, 'applied', j1, u1, '15-18 LPA'],
    ['Arun Kumar', 'arun@email.com', '+91 98765 43212', ['Java', 'React'], 6, 8.5, 'interview', j1, u1, '20-24 LPA'],
    ['Priya Singh', 'priya.s@email.com', '+91 98765 43213', ['SQL', 'Java'], 5, 8.7, 'interview', j1, u2, '16-20 LPA'],
    ['Vikram Desai', 'vikram@email.com', '+91 98765 43214', ['Kafka', 'Microservices'], 7, 9.1, 'selected', j1, u1, '25-30 LPA'],
    ['Priya Mehta', 'priya.m@email.com', '+91 98765 43215', ['Java'], 4, 8.0, 'joined', j1, u2, '14-16 LPA'],
    ['Raj Kumar', 'raj.k@email.com', '+91 98765 43216', ['Java', 'Spring Boot', 'AWS', 'Microservices', 'SQL'], 5, 8.7, 'interview', j1, u1, '18-22 LPA'],
    ['Sneha Reddy', 'sneha@email.com', '+91 98765 43217', ['Python', 'Django'], 3, 7.2, 'applied', j2, u2, '12-15 LPA'],
    ['Karthik Nair', 'karthik@email.com', '+91 98765 43218', ['Python', 'FastAPI'], 4, 7.8, 'screening', j2, u2, '14-18 LPA'],
    ['Ananya Iyer', 'ananya@email.com', '+91 98765 43219', ['Figma', 'UI Design'], 3, 6.8, 'applied', j3, u3, '10-14 LPA'],
  ];

  for (const c of candidates) {
    await client.query(
      `INSERT INTO candidates (name, email, phone, skills, experience_years, ai_score, stage, job_id, recruiter_id, salary_expectation, tenant_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
      [c[0], c[1], c[2], JSON.stringify(c[3]), c[4], c[5], c[6], c[7], c[8], c[9], staffpro]
    );
  }

  const today = new Date();
  const fmt = (d: Date, h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };

  await client.query(
    `INSERT INTO interviews (candidate_id, scheduled_at, round_type, status, meeting_link, score) VALUES
      (7, $1, 'Round 1', 'confirmed', 'https://zoom.us/j/123456', NULL),
      (4, $2, 'Final', 'pending', 'https://zoom.us/j/789012', NULL),
      (3, $3, 'Tech', 'confirmed', 'https://zoom.us/j/345678', NULL),
      (7, '2026-05-15T10:00:00Z', 'Technical Assessment', 'completed', NULL, 8.5)`,
    [fmt(today, 10), fmt(today, 14), fmt(today, 16, 30)]
  );

  const messages: [number, string, string, boolean][] = [
    [7, 'recruiter', 'Hi! Are you interested in Java Developer role at TCS?', true],
    [7, 'Raj Kumar', "Yes! I'm very interested. What's the next step?", false],
    [7, 'recruiter', 'Great! When can you take a technical interview?', true],
    [7, 'Raj Kumar', 'When can we schedule the interview?', false],
    [4, 'recruiter', 'Hi Priya, following up on the Java role.', true],
    [4, 'Priya Singh', 'Interested in Java role at TCS', false],
    [3, 'recruiter', 'Can you send the job description?', false],
    [2, 'Neha Sharma', 'Thanks for the opportunity!', false],
  ];
  for (const [cid, sender, content, out] of messages) {
    await client.query(
      'INSERT INTO messages (candidate_id, sender, content, is_outgoing) VALUES ($1, $2, $3, $4)',
      [cid, sender, content, out]
    );
  }

  await client.query(
    `INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES
      ('pipeline', 'Raj Kumar moved to Interview', $1, 7, $3),
      ('message', 'Priya Sharma replied on WhatsApp', $2, 4, $3),
      ('pipeline', '5 candidates rejected', $1, NULL, $3),
      ('interview', 'Interview completed for Raj Kumar - Score 8.5/10', $1, 7, $3)`,
    [u1, u2, staffpro]
  );

  await client.query(
    `INSERT INTO settings (tenant_id, key, value) VALUES
      ($1, 'whatsapp', '{"connected": true, "phone": "+91 98765 43210", "businessName": "StaffPro Agency"}'),
      ($1, 'branding', '{"companyName": "StaffPro Agency", "primaryColor": "#2563EB"}')`,
    [staffpro]
  );

  if (talentbridge) {
    await client.query(
      `INSERT INTO settings (tenant_id, key, value) VALUES
        ($1, 'whatsapp', '{"connected": true, "phone": "+91 90000 00001", "businessName": "TalentBridge"}'),
        ($1, 'branding', '{"companyName": "TalentBridge Solutions", "primaryColor": "#0D9488"}')`,
      [talentbridge]
    );
  }

  await seedCompaniesAndFollowUps(client, staffpro, u1, u2, j1);
}

async function seedCompaniesAndFollowUps(
  client: pg.PoolClient,
  tenantId: number,
  u1: number | null,
  u2: number | null,
  _j1: number | null
) {
  const { rows: coCount } = await client.query('SELECT COUNT(*)::int AS c FROM companies WHERE tenant_id = $1', [tenantId]);
  if (coCount[0].c > 0) return;

  const companies = await client.query(
    `INSERT INTO companies (tenant_id, name, industry, location, status) VALUES
      ($1, 'TCS', 'IT Services', 'Mumbai', 'active'),
      ($1, 'Infosys', 'IT Services', 'Bangalore', 'active'),
      ($1, 'Thoughtworks', 'Consulting', 'Pune', 'active'),
      ($1, 'Global Services', 'BPO', 'Mumbai', 'active')
     RETURNING id, name`,
    [tenantId]
  );

  const hash = bcrypt.hashSync('password123', 10);
  const tcsId = companies.rows.find((c) => c.name === 'TCS')?.id;
  if (tcsId) {
    const hmCheck = await client.query(
      'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
      ['anil.mehta@client.com', tenantId]
    );
    if (hmCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, name, role, tenant_id, company_id) VALUES ($1, $2, 'Anil Mehta', 'hiring_manager', $3, $4)`,
        ['anil.mehta@client.com', hash, tenantId, tcsId]
      );
    }
  }

  if (u2) await seedFollowUpsOnly(client, tenantId, u2);
}

async function seedFollowUpsOnly(client: pg.PoolClient, tenantId: number, assignedTo: number | null) {
  const { rows: fuCount } = await client.query('SELECT COUNT(*)::int AS c FROM follow_ups WHERE tenant_id = $1', [tenantId]);
  if (fuCount[0].c > 0) return;

  const { rows: cands } = await client.query(
    'SELECT id, name FROM candidates WHERE tenant_id = $1 ORDER BY id LIMIT 4',
    [tenantId]
  );
  if (cands.length === 0) return;

  const now = Date.now();
  const items = [
    { cid: cands[0]?.id, due: new Date(now - 86400000).toISOString(), status: 'overdue', type: 'call', ai: 'No response in 5 days — try WhatsApp' },
    { cid: cands[1]?.id ?? cands[0].id, due: new Date(now).toISOString(), status: 'today', type: 'whatsapp', ai: 'Candidate opened JD — good time to call' },
    { cid: cands[2]?.id ?? cands[0].id, due: new Date(now + 86400000 * 2).toISOString(), status: 'upcoming', type: 'email', ai: null },
    { cid: cands[3]?.id ?? cands[0].id, due: new Date(now - 86400000 * 3).toISOString(), status: 'missed', type: 'call', ai: 'Escalation: 3+ missed attempts' },
  ];

  for (const item of items) {
    if (!item.cid) continue;
    await client.query(
      `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, ai_suggestion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, item.cid, assignedTo, item.due, item.type, item.status, item.ai]
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initDb()
    .then(() => {
      console.log('Database initialized');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
