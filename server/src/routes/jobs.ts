import { Router, type Request, type Response, type NextFunction } from 'express';
import { pool } from '../db.js';
import { candidateScopeSql } from '../services/accessScope.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantClause, tenantMiddleware } from '../middleware/tenant.js';
import { aiMode, generateJobDescription } from '../services/ai.js';
import { generateJdWithPythonService } from '../services/parserService.js';
import {
  ensureJobScreeningQuestions,
  generateJobScreeningQuestions,
  saveJobScreeningQuestions,
} from '../services/screeningQuestions.js';

import {
  emptyStateSuggestions,
  mapCandidateRow,
  mapJobRow,
  recommendJobs,
} from '../services/jobRecommendation.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

// Placement tenure options; drives the post-joining check-in schedule per job.
const TENURE_OPTIONS = [30, 45, 60, 90, 120, 150, 180];

// Only org admins and hiring managers may create, edit, or delete jobs.
function canManageJobs(req: Request, res: Response, next: NextFunction) {
  const role = req.user!.role;
  if (role !== 'admin' && role !== 'hiring_manager') {
    return res.status(403).json({ error: 'Only organization admins and hiring managers can manage jobs' });
  }
  next();
}

/** Match candidate list scoping — recruiters/HMs only see their own team's counts. */
function validateJobLocation(body: Record<string, unknown>, isCreate: boolean): string | null {
  const lat = body.latitude != null && body.latitude !== '' ? Number(body.latitude) : null;
  const lng = body.longitude != null && body.longitude !== '' ? Number(body.longitude) : null;
  if (isCreate && (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng))) {
    return 'latitude and longitude are required when creating a job';
  }
  // Reject the empty-form placeholder (0, 0) — a real pin must be chosen on the map.
  if (isCreate && lat === 0 && lng === 0) {
    return 'Select a job address on the map — latitude and longitude are required';
  }
  if (lat != null && (lat < -90 || lat > 90)) return 'latitude must be between -90 and 90';
  if (lng != null && (lng < -180 || lng > 180)) return 'longitude must be between -180 and 180';
  // Address is required on create; city/state/country/pincode are best-effort from Places
  // (many Indian addresses omit postal_code in Google components).
  if (isCreate) {
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address) {
      return 'address is required when creating a job — pick a place from Google Maps suggestions';
    }
  }
  return null;
}

/**
 * @openapi
 * /api/jobs/recommend/{candidateId}:
 *   get:
 *     summary: Recommend active jobs for a candidate
 *     tags: [Jobs]
 */
router.get('/recommend/:candidateId', async (req, res) => {
  const candidateId = Number(req.params.candidateId);
  if (!Number.isFinite(candidateId)) return res.status(400).json({ error: 'Invalid candidate id' });

  const { rows: candRows } = await pool.query(
    `SELECT c.*,
       assigned.city AS assigned_job_city,
       assigned.location AS assigned_job_location
     FROM candidates c
     LEFT JOIN jobs assigned
       ON assigned.id = c.job_id AND assigned.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [candidateId, tid(req)]
  );
  if (!candRows[0]) return res.status(404).json({ error: 'Candidate not found' });

  const { rows: jobRows } = await pool.query(
    `SELECT * FROM jobs
     WHERE tenant_id = $1 AND status IN ('active', 'urgent', 'open')
     ORDER BY created_at DESC
     LIMIT 500`,
    [tid(req)]
  );

  const candidate = mapCandidateRow(candRows[0]);
  const jobs = jobRows.map(mapJobRow);
  // Suggested companies are alternatives for the candidate's assigned job, so
  // keep them in that job's city. Jobs without a structured city fall back to
  // their legacy location value.
  const assignedJobCity =
    candRows[0].assigned_job_city || candRows[0].assigned_job_location || undefined;

  const maxDistanceKm = req.query.max_distance_km ? Number(req.query.max_distance_km) : undefined;
  const sortBy = req.query.sort as 'match' | 'salary' | 'distance' | undefined;
  const jobType = req.query.job_type ? String(req.query.job_type) : undefined;

  const recommendations = recommendJobs(candidate, jobs, {
    maxResults: 100,
    city: assignedJobCity,
    maxDistanceKm: maxDistanceKm != null && !Number.isNaN(maxDistanceKm) ? maxDistanceKm : undefined,
    jobType,
    sortBy: sortBy === 'salary' || sortBy === 'distance' ? sortBy : 'match',
    fresher: req.query.fresher === 'true',
    experienced: req.query.experienced === 'true',
  });

  const suggestions = recommendations.length === 0 ? emptyStateSuggestions(jobs) : undefined;

  res.json({ recommendations, suggestions });
});

router.get('/', async (req, res) => {
  const t = tenantClause(tid(req), 'j', 1);
  const scope = candidateScopeSql(req, 'c', t.nextIndex);
  const params = [t.param, ...scope.params];

  const { rows } = await pool.query(
    `SELECT j.*, u.name AS assigned_name,
      (SELECT COUNT(*)::int FROM candidates c
         WHERE c.job_id = j.id AND c.tenant_id = j.tenant_id${scope.sql}) AS pipeline_count,
      (SELECT ROUND(AVG(c.ai_score)::numeric, 1) FROM candidates c
         WHERE c.job_id = j.id AND c.tenant_id = j.tenant_id${scope.sql}) AS avg_ai_score
    FROM jobs j
    LEFT JOIN users u ON j.assigned_to = u.id AND u.tenant_id = j.tenant_id
    WHERE ${t.sql}
    ORDER BY j.created_at DESC`,
    params
  );

  const jobs = rows.map((j) => ({
    ...j,
    pipeline_count: Number(j.pipeline_count) || 0,
    match_percent: j.avg_ai_score ? Math.min(99, Math.round(Number(j.avg_ai_score) * 10)) : 0,
  }));
  res.json(jobs);
});

// Draft a job description from the basics typed into the add-job form.
// Uses Ollama when configured; Python templates only when AI is disabled.
router.post('/generate-description', async (req, res) => {
  const { title, client, location, open_positions, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const input = {
    title,
    client,
    location,
    openPositions: open_positions ? Number(open_positions) : null,
    notes,
  };

  if (aiMode() === 'live') {
    const description = await generateJobDescription(input);
    if (!description) {
      return res.status(502).json({
        error: 'JD generation failed — check AI_BASE_URL/AI_MODEL and that Ollama is running',
      });
    }
    return res.json({ description });
  }

  const description = await generateJdWithPythonService(input);
  if (!description) {
    return res.status(502).json({ error: 'JD generation failed — is the parser service running?' });
  }
  res.json({ description });
});

// Return JD-derived screening questions for a job (generates on first access).
router.get('/:id/screening-questions', async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'Invalid job id' });

  const { rows } = await pool.query(
    'SELECT id, title FROM jobs WHERE id = $1 AND tenant_id = $2',
    [jobId, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });

  const questions = await ensureJobScreeningQuestions(jobId, tid(req));
  res.json({ job_id: jobId, job_title: rows[0].title, questions });
});

// Regenerate screening questions from the current JD (admin/HM only).
router.post('/:id/generate-screening-questions', canManageJobs, async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'Invalid job id' });

  const { rows } = await pool.query(
    'SELECT title, description, client, location FROM jobs WHERE id = $1 AND tenant_id = $2',
    [jobId, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });

  const questions = await generateJobScreeningQuestions(rows[0]);
  await saveJobScreeningQuestions(jobId, tid(req), questions);
  res.json({ job_id: jobId, job_title: rows[0].title, questions });
});

/** Applications for one job's pipeline, grouped client-side by stage. */
router.get('/:id/pipeline', async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'Invalid job id' });

  const { rows: job } = await pool.query('SELECT id, title FROM jobs WHERE id = $1 AND tenant_id = $2', [
    jobId,
    tid(req),
  ]);
  if (!job[0]) return res.status(404).json({ error: 'Job not found' });

  const { rows } = await pool.query(
    `SELECT a.id AS application_id, a.stage, a.ai_score, a.offer_status,
            a.expected_joining_at, a.joined_at, a.updated_at,
            c.id AS candidate_id, c.name, c.email, c.phone, c.skills,
            c.experience_years, c.is_hot,
            u.name AS recruiter_name
     FROM applications a
     JOIN candidates c ON c.id = a.candidate_id AND c.tenant_id = a.tenant_id
     LEFT JOIN users u ON u.id = a.recruiter_id AND u.tenant_id = a.tenant_id
     WHERE a.tenant_id = $1 AND a.job_id = $2
     ORDER BY a.updated_at DESC
     LIMIT 500`,
    [tid(req), jobId]
  );
  res.json({ job: job[0], applications: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT j.*, u.name AS assigned_name FROM jobs j
     LEFT JOIN users u ON j.assigned_to = u.id AND u.tenant_id = j.tenant_id
     WHERE j.id = $1 AND j.tenant_id = $2`,
    [req.params.id, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });
  res.json(rows[0]);
});

router.post('/', canManageJobs, async (req, res) => {
  const {
    title,
    client,
    location,
    status,
    assigned_to,
    open_positions,
    description,
    tenure_days,
    latitude,
    longitude,
    address,
    city,
    state,
    country,
    pincode,
    required_qualification,
    required_languages,
    min_age,
    max_age,
    min_experience,
    max_experience,
    required_skills,
    salary,
    shift,
    job_type,
    gender_preference,
  } = req.body;
  if (!title || !client || !location) {
    return res.status(400).json({ error: 'Title, client, and location required' });
  }
  const locErr = validateJobLocation(req.body, true);
  if (locErr) return res.status(400).json({ error: locErr });
  if (tenure_days != null && !TENURE_OPTIONS.includes(Number(tenure_days))) {
    return res.status(400).json({ error: `tenure_days must be one of ${TENURE_OPTIONS.join(', ')}` });
  }

  const { rows } = await pool.query(
    `INSERT INTO jobs (
      title, client, location, status, assigned_to, open_positions, description, tenure_days, tenant_id,
      latitude, longitude, address, city, state, country, pincode,
      required_qualification, required_languages, min_age, max_age, min_experience, max_experience,
      required_skills, salary, shift, job_type, gender_preference
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22,
      $23::jsonb, $24, $25, $26, $27
    ) RETURNING *`,
    [
      title,
      client,
      location,
      status || 'active',
      assigned_to || req.user!.id,
      open_positions || 1,
      description || null,
      tenure_days != null ? Number(tenure_days) : null,
      tid(req),
      Number(latitude),
      Number(longitude),
      address || null,
      city || null,
      state || null,
      country || null,
      pincode || null,
      required_qualification || null,
      JSON.stringify(Array.isArray(required_languages) ? required_languages : []),
      min_age != null ? Number(min_age) : null,
      max_age != null ? Number(max_age) : null,
      min_experience != null ? Number(min_experience) : null,
      max_experience != null ? Number(max_experience) : null,
      JSON.stringify(Array.isArray(required_skills) ? required_skills : []),
      salary || null,
      shift || null,
      job_type || null,
      gender_preference || null,
    ]
  );
  const job = rows[0];
  if (description?.trim()) {
    const questions = await generateJobScreeningQuestions({
      title,
      description,
      client,
      location,
    });
    await saveJobScreeningQuestions(job.id, tid(req), questions);
    job.screening_questions = questions;
  }
  res.status(201).json(job);
});

router.patch('/:id', canManageJobs, async (req, res) => {
  const locErr = validateJobLocation(req.body, false);
  if (locErr) return res.status(400).json({ error: locErr });

  const fields = [
    'title', 'client', 'location', 'status', 'assigned_to', 'open_positions', 'description', 'tenure_days',
    'latitude', 'longitude', 'address', 'city', 'state', 'country', 'pincode',
    'required_qualification', 'min_age', 'max_age', 'min_experience', 'max_experience',
    'salary', 'shift', 'job_type', 'gender_preference',
  ] as const;
  const jsonFields = ['required_languages', 'required_skills'] as const;
  if (
    req.body.tenure_days !== undefined &&
    req.body.tenure_days !== null &&
    !TENURE_OPTIONS.includes(Number(req.body.tenure_days))
  ) {
    return res.status(400).json({ error: `tenure_days must be one of ${TENURE_OPTIONS.join(', ')}` });
  }
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      params.push(req.body[f]);
    }
  }
  for (const f of jsonFields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}::jsonb`);
      params.push(JSON.stringify(Array.isArray(req.body[f]) ? req.body[f] : []));
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });

  if (req.body.description !== undefined && req.body.description?.trim()) {
    const questions = await generateJobScreeningQuestions({
      title: rows[0].title,
      description: rows[0].description,
      client: rows[0].client,
      location: rows[0].location,
    });
    await saveJobScreeningQuestions(rows[0].id, tid(req), questions);
    rows[0].screening_questions = questions;
  }

  res.json(rows[0]);
});

router.delete('/:id', canManageJobs, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM jobs WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    tid(req),
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Job not found' });
  res.status(204).send();
});

export default router;
