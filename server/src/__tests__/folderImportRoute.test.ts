import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  candidateCount: 0,
  duplicate: null as null | { id: number; resume_meta: unknown },
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  saveCandidateResume: vi.fn(),
  assertJobInTenant: vi.fn(),
}));

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.poolQuery,
    connect: mocks.connect,
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: ((req, res, next) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.user = {
      id: 7,
      email: 'recruiter@example.com',
      name: 'Recruiter',
      role: 'recruiter',
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
      name: 'Test',
      plan: 'starter',
      status: 'active',
      primary_color: '#000000',
      logo_initials: 'T',
      logo_path: null,
      features: [],
    };
    next();
  }) satisfies RequestHandler,
  requireTenant: ((_req, _res, next) => next()) satisfies RequestHandler,
  assertJobInTenant: mocks.assertJobInTenant,
  tenantClause: (tenantId: number, alias: string, paramIndex: number) => ({
    sql: `${alias}.tenant_id = $${paramIndex}`,
    param: tenantId,
    nextIndex: paramIndex + 1,
  }),
}));

vi.mock('../services/fileStorage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/fileStorage.js')>();
  return { ...actual, saveCandidateResume: mocks.saveCandidateResume };
});

const { default: candidateRoutes } = await import('../routes/candidates.js');

const app = express();
app.use(express.json());
app.use('/api/candidates', candidateRoutes);
app.use(((err, _req, res, _next) => {
  res.status(500).json({ error: err.message });
}) satisfies ErrorRequestHandler);

function validCandidate(overrides: Record<string, string> = {}) {
  return JSON.stringify({
    candidateName: 'Alice Applicant',
    candidateEmail: 'alice@example.com',
    candidatePhone: '9999999999',
    jobTitle: 'Support Engineer',
    skills: 'Support, Linux',
    experience_years: '4',
    notes: 'Experienced candidate',
    ...overrides,
  });
}

function importRequest(candidate = validCandidate(), pdf = Buffer.from('%PDF-1.7 test')) {
  return request(app)
    .post('/api/candidates/import-folder')
    .set('Authorization', 'Bearer test-token')
    .field('candidate', candidate)
    .attach('resume', pdf, { filename: 'alice.pdf', contentType: 'application/pdf' });
}

beforeEach(() => {
  mocks.candidateCount = 0;
  mocks.duplicate = null;
  mocks.poolQuery.mockReset();
  mocks.clientQuery.mockReset();
  mocks.connect.mockReset();
  mocks.release.mockReset();
  mocks.saveCandidateResume.mockReset();
  mocks.assertJobInTenant.mockReset();

  mocks.assertJobInTenant.mockResolvedValue(true);
  mocks.saveCandidateResume.mockResolvedValue('1/candidates/101.pdf');
  mocks.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('COUNT(*)::int AS c FROM candidates')) {
      return { rows: [{ c: mocks.candidateCount }] };
    }
    if (sql.includes('SELECT id, title FROM jobs')) {
      return { rows: [{ id: 22, title: 'Support Engineer' }] };
    }
    return { rows: [] };
  });
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, resume_meta FROM candidates')) {
      return { rows: mocks.duplicate ? [mocks.duplicate] : [] };
    }
    if (sql.includes('INSERT INTO candidates')) return { rows: [{ id: 101 }] };
    return { rows: [], rowCount: 1 };
  });
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
});

describe('POST /api/candidates/import-folder', () => {
  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/candidates/import-folder')
      .field('candidate', validCandidate())
      .attach('resume', Buffer.from('%PDF-test'), 'alice.pdf');

    expect(response.status).toBe(401);
  });

  it('imports one candidate and stores its PDF before committing', async () => {
    const response = await importRequest();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'imported', candidate_id: 101 });
    expect(mocks.saveCandidateResume).toHaveBeenCalledWith(
      1,
      101,
      expect.any(Buffer),
      '.pdf',
      'application/pdf'
    );
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
  });

  it('skips a duplicate that already has a resume without overwriting it', async () => {
    mocks.duplicate = { id: 55, resume_meta: { storage_path: 'existing.pdf' } };
    const response = await importRequest();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'skipped_duplicate', candidate_id: 55 });
    expect(mocks.saveCandidateResume).not.toHaveBeenCalled();
  });

  it('attaches a PDF when the duplicate candidate has no resume', async () => {
    mocks.duplicate = { id: 56, resume_meta: null };
    const response = await importRequest();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'resume_attached', candidate_id: 56 });
    expect(mocks.saveCandidateResume).toHaveBeenCalledWith(
      1,
      56,
      expect.any(Buffer),
      '.pdf',
      'application/pdf'
    );
  });

  it('rejects invalid PDFs and malformed candidate data', async () => {
    const invalidPdf = await importRequest(validCandidate(), Buffer.from('not a pdf'));
    expect(invalidPdf.status).toBe(400);
    expect(invalidPdf.body.error).toMatch(/valid PDF/);

    const invalidCandidate = await importRequest('{broken');
    expect(invalidCandidate.status).toBe(400);
    expect(invalidCandidate.body.error).toMatch(/valid JSON/);
  });

  it('rejects an oversized PDF', async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    oversized.write('%PDF-', 0);
    const response = await importRequest(validCandidate(), oversized);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/10 MB limit/);
  });

  it('validates the default job inside the tenant', async () => {
    mocks.assertJobInTenant.mockResolvedValue(false);
    const response = await importRequest().field('default_job_id', '999');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid default job/);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('preserves the candidate plan limit', async () => {
    mocks.candidateCount = 2200;
    const response = await importRequest();

    expect(response.status).toBe(402);
    expect(response.body.code).toBe('PLAN_LIMIT');
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('rolls back the candidate when resume storage fails', async () => {
    mocks.saveCandidateResume.mockRejectedValue(new Error('storage unavailable'));
    const response = await importRequest();

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Failed to import Alice Applicant/);
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).not.toContain('COMMIT');
  });
});
