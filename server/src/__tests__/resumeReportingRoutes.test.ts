import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import request, { type Response as SupertestResponse } from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  role: 'admin',
  poolQuery: vi.fn(),
}));

vi.mock('../db.js', () => ({ pool: { query: mocks.poolQuery } }));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: ((req, _res, next) => {
    req.user = {
      id: 7,
      email: 'user@example.com',
      name: 'Test User',
      role: mocks.role,
      tenant_id: 1,
    };
    next();
  }) satisfies RequestHandler,
}));

vi.mock('../middleware/tenant.js', () => ({
  tenantMiddleware: ((req, _res, next) => {
    req.tenant = {
      id: 1,
      slug: 'test',
      name: 'Test Organization',
      plan: 'starter',
      status: 'active',
      primary_color: '#2563EB',
      logo_initials: 'TO',
      logo_path: null,
      features: [],
    };
    next();
  }) satisfies RequestHandler,
  requireTenant: ((_req, _res, next) => next()) satisfies RequestHandler,
  assertJobInTenant: vi.fn().mockResolvedValue(true),
  tenantClause: (tenantId: number, alias: string, paramIndex: number) => ({
    sql: `${alias}.tenant_id = $${paramIndex}`,
    param: tenantId,
    nextIndex: paramIndex + 1,
  }),
}));

const { default: candidateRoutes } = await import('../routes/candidates.js');

const app = express();
app.use(express.json());
app.use('/api/candidates', candidateRoutes);
app.use(((err, _req, res, _next) => {
  res.status(500).json({ error: err.message });
}) satisfies ErrorRequestHandler);

function binaryParser(
  response: SupertestResponse,
  callback: (error: Error | null, body?: unknown) => void
) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error) => callback(error as Error));
}

function dashboardResults(sql: string) {
  if (sql.includes('COUNT(DISTINCT c.job_id)')) {
    return { rows: [{ resumes: 4, jobs: 2, hiring_managers: 1, recruiters: 2 }] };
  }
  if (sql.includes("COALESCE(j.title, 'Unassigned Job')")) {
    return { rows: [{ job_id: 9, job_title: 'Support Engineer', client: 'Acme', count: 3 }, { job_id: null, job_title: 'Unassigned Job', client: '—', count: 1 }] };
  }
  if (sql.includes("GROUP BY COALESCE(NULLIF(c.offer_status, ''), c.stage)")) {
    return { rows: [{ status: 'applied', count: 3 }, { status: 'offer_rejected', count: 1 }] };
  }
  if (sql.includes('AS hiring_manager_id')) {
    return { rows: [
      { hiring_manager_id: 10, hiring_manager_name: 'Harsha Manager', recruiter_id: 11, recruiter_name: 'Rita Recruiter', count: 3 },
      { hiring_manager_id: null, hiring_manager_name: 'Unassigned Hiring Manager', recruiter_id: null, recruiter_name: 'Unassigned Recruiter', count: 1 },
    ] };
  }
  return { rows: [] };
}

beforeEach(() => {
  mocks.role = 'admin';
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string) => dashboardResults(sql));
});

describe('resume reporting routes', () => {
  it('exports the requested resume profile fields as readable CSV', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('c.technical_skills AS primary_skills')) {
        return { rows: [{
          name: 'Alice Applicant',
          email: 'alice@example.com',
          phone: '9999999999',
          stage: 'screening',
          offer_status: null,
          job_title: 'Support Engineer',
          recruiter_name: 'Rita Recruiter',
          skills: ['Communication', 'Customer Support'],
          education: [{ degree: 'B.Tech', institution: 'Delhi University', year: '2022' }],
          highest_qualification: 'B.Tech',
          experience_years: 3.5,
          notice_period: 'Within 30 Days',
          current_salary: '6 LPA',
          salary_expectation: '8 LPA',
          primary_skills: ['Linux', 'SQL'],
          secondary_skills: ['Teamwork', 'Empathy'],
          ai_score: 8.2,
          updated_at: '2026-08-24T00:00:00.000Z',
        }] };
      }
      return dashboardResults(sql);
    });

    const response = await request(app).get('/api/candidates/export?notice_period=Within%2030%20Days');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('candidates.csv');
    expect(response.text).toContain('"Skills"');
    expect(response.text).toContain('"Education"');
    expect(response.text).toContain('"Total Years of Experience"');
    expect(response.text).toContain('"Notice Period"');
    expect(response.text).toContain('"Current Salary"');
    expect(response.text).toContain('"Expected Salary"');
    expect(response.text).toContain('"Primary Skills"');
    expect(response.text).toContain('"Secondary Skills"');
    expect(response.text).toContain('Communication, Customer Support');
    expect(response.text).toContain('B.Tech — Delhi University (2022)');
    expect(response.text).toContain('Linux, SQL');
    expect(response.text).toContain('Teamwork, Empathy');
    expect(response.text).toContain('"6 LPA"');
    expect(response.text).toContain('"8 LPA"');
    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(String(sql)).toContain('c.notice_period = $2');
    expect(params).toContain('Within 30 Days');
  });

  it('filters candidates by a validated notice period', async () => {
    const response = await request(app).get('/api/candidates?notice_period=Within%2030%20Days');
    expect(response.status).toBe(200);
    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(String(sql)).toContain('c.notice_period = $2');
    expect(params).toContain('Within 30 Days');

    const invalid = await request(app).get('/api/candidates?notice_period=Someday');
    expect(invalid.status).toBe(400);
  });

  it('rejects recruiter dashboard and export access, including legacy CSV', async () => {
    mocks.role = 'recruiter';
    expect((await request(app).get('/api/candidates/resume-dashboard')).status).toBe(403);
    expect((await request(app).get('/api/candidates/export.xlsx?job_id=9')).status).toBe(403);
    expect((await request(app).get('/api/candidates/export')).status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('returns uploaded-resume analytics with date and unassigned buckets', async () => {
    const response = await request(app).get('/api/candidates/resume-dashboard?from=2026-08-01&to=2026-08-23');
    expect(response.status).toBe(200);
    expect(response.body.totals).toEqual({ resumes: 4, jobs: 2, hiringManagers: 1, recruiters: 2 });
    expect(response.body.byStatus).toContainEqual({ status: 'offer_rejected', count: 1 });
    expect(response.body.byManager[1]).toMatchObject({
      hiringManagerName: 'Unassigned Hiring Manager',
      count: 1,
    });
    const sqlCalls = mocks.poolQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls.every((sql) => sql.includes("c.resume_meta->>'storage_path'"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("INTERVAL '1 day'"))).toBe(true);
  });

  it('uses managed recruiter scope for a hiring manager', async () => {
    mocks.role = 'hiring_manager';
    const response = await request(app).get('/api/candidates/resume-dashboard');
    expect(response.status).toBe(200);
    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(String(sql)).toContain("r.managed_by_id = $2");
    expect(params).toEqual([1, 7, 1]);
  });

  it('validates dashboard dates and the required export job', async () => {
    expect((await request(app).get('/api/candidates/resume-dashboard?from=08-01-2026')).status).toBe(400);
    expect((await request(app).get('/api/candidates/resume-dashboard?from=2026-08-24&to=2026-08-23')).status).toBe(400);
    expect((await request(app).get('/api/candidates/export.xlsx')).status).toBe(400);
  });

  it('returns a styled XLSX containing only the scoped resume rows', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, title, client, location FROM jobs')) {
        return { rows: [{ id: 9, title: 'Support Engineer', client: 'Acme', location: 'Pune' }] };
      }
      if (sql.includes('AS effective_status')) {
        return { rows: [{
          id: 42,
          name: 'Alice Applicant',
          email: 'alice@example.com',
          phone: '9999999999',
          effective_status: 'applied',
          hiring_manager_name: 'Harsha Manager',
          recruiter_name: 'Rita Recruiter',
          experience_years: 4,
          skills: ['Support'],
          technical_skills: ['Linux'],
          resume_filename: 'alice.pdf',
          created_at: new Date('2026-08-01'),
          updated_at: new Date('2026-08-02'),
        }] };
      }
      return { rows: [] };
    });

    const response = await request(app)
      .get('/api/candidates/export.xlsx?job_id=9')
      .buffer(true)
      .parse(binaryParser);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toMatch(/support-engineer-resumes-\d{4}-\d{2}-\d{2}\.xlsx/);
    expect(Buffer.isBuffer(response.body)).toBe(true);
    const detailSql = mocks.poolQuery.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes('AS effective_status'))!;
    expect(detailSql).toContain("c.resume_meta->>'storage_path'");
    expect(response.body.subarray(0, 2).toString()).toBe('PK');
  });

  it('does not export a job from another tenant', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    expect((await request(app).get('/api/candidates/export.xlsx?job_id=999')).status).toBe(404);
  });
});
