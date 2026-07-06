import pg from 'pg';
import bcrypt from 'bcryptjs';
import { DB_SCHEMA, pool, useSchema } from './dbConfig.js';

export { pool, DB_SCHEMA };

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
        candidate_id INTEGER REFERENCES candidates(id),
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
    await migrateFollowUpEngine(client);
    await migrateMultiTenant(client);
    await ensureAllTenantsSeeded(client);

    const { rows: candRows } = await client.query('SELECT COUNT(*)::int AS c FROM candidates');
    if (candRows[0].c === 0) await seedDb(client);
    else await seedPhase1Extras(client);
  } finally {
    client.release();
  }
}

async function migratePhase1Tables(client: pg.PoolClient) {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata'`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hm_notes TEXT`);
}

async function migrateFollowUpEngine(client: pg.PoolClient) {
  // Candidate lifecycle fields used by the follow-up rules engine
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offer_status TEXT`);
  await client.query(`UPDATE candidates SET joined_at = updated_at WHERE stage = 'joined' AND joined_at IS NULL`);

  // Rule metadata on follow-ups
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'manual'`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS outcome TEXT`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS interview_id INTEGER REFERENCES interviews(id) ON DELETE CASCADE`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS milestone_day INTEGER`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES follow_ups(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE`);
  await client.query(`CREATE INDEX IF NOT EXISTS follow_ups_rule_idx ON follow_ups (tenant_id, candidate_id, category)`);
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
  if (tenantCount[0].c === 0) {
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

  await ensureDemoUsers(client, defaultId);
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
    await client.query(
      `UPDATE users SET email = 'nidhi@earlyjobs.in', name = 'Nidhi'
       WHERE email = 'recruiter@earlyjobs.com' AND tenant_id = $1`,
      [ejId]
    );
    await client.query(
      `UPDATE users SET email = 'moumita@earlyjobs.in', name = 'Moumita'
       WHERE email = 'ravi@earlyjobs.com' AND tenant_id = $1`,
      [ejId]
    );
    const ejUsers = [
      ['admin@earlyjobs.com', 'EarlyJobs Admin', 'admin'],
      ['nidhi@earlyjobs.in', 'Nidhi', 'recruiter'],
      ['moumita@earlyjobs.in', 'Moumita', 'recruiter'],
    ];
    for (const [email, name, role] of ejUsers) {
      const exists = await client.query(
        'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
        [email, ejId]
      );
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO users (email, password_hash, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5)`,
          [email, hash, name, role, ejId]
        );
      }
    }
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
        const exists = await client.query(
          'SELECT id FROM jobs WHERE tenant_id = $1 AND title = $2 LIMIT 1',
          [ejId, title]
        );
        if (exists.rows.length > 0) continue;
        await client.query(
          `INSERT INTO jobs (title, client, location, status, assigned_to, open_positions, description, tenant_id)
           VALUES ($1, $2, $3, 'active', $4, 1, $5, $6)`,
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
    ['Arun Kumar', 'arun@email.com', '+91 98765 43212', ['Java', 'React'], 6, 8.5, 'screening', j1, u1, '20-24 LPA'],
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
