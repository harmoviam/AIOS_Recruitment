import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import {
  loadTenantBySlug,
  publicTenantLogoUrl,
  type TenantRecord,
} from '../middleware/tenant.js';
import {
  isAllowedMimeType,
  RESUME_MAX_BYTES,
  saveCandidateResume,
  ALLOWED_MIME_TYPES,
  ALLOWED_LOGO_MIME_TYPES,
  readStoredFile,
  fileExists,
} from '../services/fileStorage.js';
import { extractAndParseResume } from '../services/parserService.js';
import { applicationReceivedEmail, sendEmail } from '../services/email.js';
import { heuristicCandidateScore } from '../services/ai.js';
import { syncPrimaryApplication } from '../services/applications.js';

/**
 * Public, unauthenticated careers surface (mounted like the WhatsApp webhook).
 *
 *   GET  /api/public/:tenantSlug            tenant branding for the careers page
 *   GET  /api/public/:tenantSlug/jobs       active jobs, public fields only
 *   GET  /api/public/:tenantSlug/jobs/:id   one job
 *   POST /api/public/:tenantSlug/jobs/:id/apply   multipart apply form
 *
 * Everything is tenant-scoped by slug and exposes a whitelisted field set —
 * never assigned_to, notes, or internal counts. Agencies often hide the end
 * client, so `client` is only exposed when the tenant enables it later.
 */

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many applications from this network. Try again later.' },
});

router.use(publicLimiter);

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESUME_MAX_BYTES },
});

async function tenantOr404(
  slug: string | undefined
): Promise<TenantRecord | null> {
  if (!slug) return null;
  const tenant = await loadTenantBySlug(slug.trim().toLowerCase());
  if (!tenant || tenant.status === 'suspended') return null;
  return tenant;
}

const PUBLIC_JOB_FIELDS = `j.id, j.title, j.client, j.location, j.city, j.state, j.description,
  j.open_positions, j.salary, j.job_type, j.shift, j.industry,
  j.min_experience, j.max_experience, j.required_skills, j.created_at`;

const LOGO_MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_LOGO_MIME_TYPES).map(([mime, ext]) => [ext, mime])
);

router.get('/:tenantSlug', async (req, res) => {
  const tenant = await tenantOr404(req.params.tenantSlug);
  if (!tenant) return res.status(404).json({ error: 'Careers page not found' });
  res.json({
    slug: tenant.slug,
    name: tenant.name,
    primary_color: tenant.primary_color,
    logo_initials: tenant.logo_initials,
    logo_url: publicTenantLogoUrl(tenant.slug, tenant.logo_path),
  });
});

router.get('/:tenantSlug/logo', async (req, res) => {
  const tenant = await tenantOr404(req.params.tenantSlug);
  if (!tenant?.logo_path) return res.status(404).json({ error: 'Logo not found' });
  if (!(await fileExists(tenant.logo_path))) {
    return res.status(404).json({ error: 'Logo not found' });
  }
  const ext = path.extname(tenant.logo_path).toLowerCase();
  const mime = LOGO_MIME_BY_EXT[ext] || 'application/octet-stream';
  const buffer = await readStoredFile(tenant.logo_path);
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

router.get('/:tenantSlug/jobs', async (req, res) => {
  const tenant = await tenantOr404(req.params.tenantSlug);
  if (!tenant) return res.status(404).json({ error: 'Careers page not found' });
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_JOB_FIELDS} FROM jobs j
     WHERE j.tenant_id = $1 AND j.status = 'active'
     ORDER BY j.created_at DESC LIMIT 200`,
    [tenant.id]
  );
  res.json(rows);
});

router.get('/:tenantSlug/jobs/meta', async (req, res) => {
  const tenant = await tenantOr404(req.params.tenantSlug);
  if (!tenant) return res.status(404).json({ error: 'Careers page not found' });
  // Facets derived from live active jobs so cities/industries stay data-driven
  // and never hard-coded in the client. Jobs without a city fall back to the
  // first comma segment of `location` so places like "Mohali" still surface.
  const [total, cities, states, jobTypes, industries] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total FROM jobs WHERE tenant_id = $1 AND status = 'active'`,
      [tenant.id]
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(j.city), ''),
        NULLIF(TRIM(SPLIT_PART(j.location, ',', 1)), '')) AS city,
        NULLIF(TRIM(j.state), '') AS state,
        COUNT(*)::int AS count
       FROM jobs j WHERE j.tenant_id = $1 AND j.status = 'active'
       GROUP BY 1, 2 ORDER BY count DESC, city`,
      [tenant.id]
    ),
    pool.query(
      `SELECT NULLIF(TRIM(j.state), '') AS state, COUNT(*)::int AS count
       FROM jobs j WHERE j.tenant_id = $1 AND j.status = 'active'
         AND NULLIF(TRIM(j.state), '') IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, state`,
      [tenant.id]
    ),
    pool.query(
      `SELECT NULLIF(TRIM(j.job_type), '') AS job_type, COUNT(*)::int AS count
       FROM jobs j WHERE j.tenant_id = $1 AND j.status = 'active'
         AND NULLIF(TRIM(j.job_type), '') IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, job_type`,
      [tenant.id]
    ),
    pool.query(
      `SELECT NULLIF(TRIM(j.industry), '') AS industry, COUNT(*)::int AS count
       FROM jobs j WHERE j.tenant_id = $1 AND j.status = 'active'
         AND NULLIF(TRIM(j.industry), '') IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, industry`,
      [tenant.id]
    ),
  ]);
  res.json({
    total: Number(total.rows[0]?.total) || 0,
    cities: cities.rows.map((row) => ({
      city: row.city,
      state: row.state,
      count: Number(row.count) || 0,
    })),
    states: states.rows.map((row) => ({ state: row.state, count: Number(row.count) || 0 })),
    jobTypes: jobTypes.rows.map((row) => ({ jobType: row.job_type, count: Number(row.count) || 0 })),
    industries: industries.rows.map((row) => ({ industry: row.industry, count: Number(row.count) || 0 })),
  });
});

router.get('/:tenantSlug/jobs/:id', async (req, res) => {
  const tenant = await tenantOr404(req.params.tenantSlug);
  if (!tenant) return res.status(404).json({ error: 'Careers page not found' });
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_JOB_FIELDS} FROM jobs j
     WHERE j.tenant_id = $1 AND j.id = $2 AND j.status = 'active'`,
    [tenant.id, Number(req.params.id)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Job not found' });
  res.json(rows[0]);
});

router.post(
  '/:tenantSlug/jobs/:id/apply',
  applyLimiter,
  resumeUpload.single('resume'),
  async (req, res) => {
    const tenant = await tenantOr404(String(req.params.tenantSlug));
    if (!tenant) return res.status(404).json({ error: 'Careers page not found' });

    const jobId = Number(req.params.id);
    const { rows: jobs } = await pool.query(
      `SELECT id, title FROM jobs WHERE tenant_id = $1 AND id = $2 AND status = 'active'`,
      [tenant.id, jobId]
    );
    if (!jobs[0]) return res.status(404).json({ error: 'Job not found' });

    // Honeypot: bots fill every field; humans never see this one.
    if ((req.body?.website || '').trim() !== '') {
      return res.status(201).json({ applied: true });
    }

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    if (!name || (!email && !phone)) {
      return res.status(400).json({ error: 'Name and email or phone are required' });
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (phone && !/^\+?[\d\s-]{10,}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    if (req.file && !isAllowedMimeType(req.file.mimetype)) {
      return res.status(400).json({ error: 'Resume must be PDF, DOC, or DOCX' });
    }

    // Optional profile fields captured by the multi-step application flow.
    const city = String(req.body?.city || '').trim();
    const education = String(req.body?.education || '').trim();
    const currentRole = String(req.body?.current_role || '').trim();
    const explicitExperience =
      req.body?.experience != null && String(req.body.experience).trim() !== ''
        ? Number(req.body.experience)
        : NaN;
    const experienceYearsField = Number.isFinite(explicitExperience) && explicitExperience >= 0
      ? explicitExperience
      : undefined;
    let extraSkills: string[] = [];
    if (typeof req.body?.skills === 'string' && req.body.skills.trim() !== '') {
      try {
        const parsed = JSON.parse(req.body.skills);
        if (Array.isArray(parsed)) {
          extraSkills = parsed.map((s) => String(s).trim()).filter(Boolean).slice(0, 40);
        }
      } catch {
        // Ignore malformed skills; resume parsing still applies below.
      }
    }
    const profileNotes = [currentRole && `Current/previous role: ${currentRole}`, city && `Applied from: ${city}`]
      .filter(Boolean)
      .join('\n');
    const applyProfileValues = () => [city || null, education || null, profileNotes || null];

    // Dedupe on email or last-10-digit phone (same trick as WhatsApp inbound
    // matching): an existing candidate gets a new application, not a duplicate.
    const phoneDigits = phone.replace(/\D/g, '').slice(-10);
    const { rows: existing } = await pool.query(
      `SELECT id, name, job_id FROM candidates
       WHERE tenant_id = $1 AND (
         ($2::text <> '' AND LOWER(email) = $2) OR
         ($3::text <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $3)
       )
       ORDER BY updated_at DESC LIMIT 1`,
      [tenant.id, email, phoneDigits]
    );

    let candidateId: number;
    let isNew = false;

    if (existing[0]) {
      candidateId = existing[0].id;
      const { rows: inserted } = await pool.query(
        `INSERT INTO applications (tenant_id, candidate_id, job_id, stage, source)
         VALUES ($1, $2, $3, 'applied', 'careers')
         ON CONFLICT (candidate_id, job_id) DO NOTHING RETURNING id`,
        [tenant.id, candidateId, jobId]
      );
      if (inserted.length === 0) {
        // Already applied to this job — treat as success, don't leak state.
        return res.status(201).json({ applied: true, applicationId: candidateId });
      }
      await pool.query(
        `UPDATE candidates SET job_id = COALESCE(job_id, $1), updated_at = NOW(),
           current_location = COALESCE(NULLIF($2, ''), current_location),
           highest_qualification = COALESCE(NULLIF($3, ''), highest_qualification),
           notes = COALESCE(NULLIF($4, ''), notes),
           experience_years = COALESCE($5, experience_years)
         WHERE id = $6 AND tenant_id = $7`,
        [jobId, ...applyProfileValues(), experienceYearsField ?? null, candidateId, tenant.id]
      );
      if (extraSkills.length) {
        await pool.query(
          `UPDATE candidates SET skills = (
             SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements(skills || $2::jsonb)
           ) WHERE id = $1 AND tenant_id = $3`,
          [candidateId, JSON.stringify(extraSkills), tenant.id]
        );
      }
    } else {
      isNew = true;
      let parsedProfile: unknown = null;
      let skills: string[] = [];
      let experienceYears = 0;
      if (req.file) {
        try {
          const { profile } = await extractAndParseResume(
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname
          );
          if (profile) {
            parsedProfile = profile;
            skills = Array.isArray(profile.skills) ? profile.skills : [];
            experienceYears = Number(profile.total_experience_years) || 0;
          }
        } catch (err) {
          console.warn('Careers apply: resume parse failed:', (err as Error).message);
        }
      }

      const { rows: created } = await pool.query(
        `INSERT INTO candidates (name, email, phone, skills, experience_years, ai_score,
           stage, job_id, tenant_id, source, parsed_profile, current_location,
           highest_qualification, notes)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'applied', $7, $8, 'careers', $9::jsonb,
           $10, $11, $12)
         RETURNING id, job_id, stage, ai_score, recruiter_id, source`,
        [
          name,
          email || null,
          phone || null,
          JSON.stringify([...new Set([...skills, ...extraSkills])]),
          experienceYearsField ?? experienceYears,
          heuristicCandidateScore([...new Set([...skills, ...extraSkills])], experienceYearsField ?? experienceYears),
          jobId,
          tenant.id,
          parsedProfile ? JSON.stringify(parsedProfile) : null,
          ...applyProfileValues(),
        ]
      );
      candidateId = created[0].id;
      await syncPrimaryApplication(tenant.id, created[0]);

      if (req.file) {
        try {
          const ext =
            ALLOWED_MIME_TYPES[req.file.mimetype] || '.pdf';
          const storagePath = await saveCandidateResume(
            tenant.id,
            candidateId,
            req.file.buffer,
            ext,
            req.file.mimetype
          );
          await pool.query(
            `UPDATE candidates SET resume_meta = $1::jsonb WHERE id = $2 AND tenant_id = $3`,
            [
              JSON.stringify({
                storage_path: storagePath,
                original_filename: req.file.originalname,
                mime_type: req.file.mimetype,
                file_size_bytes: req.file.size,
                uploaded_at: new Date().toISOString(),
              }),
              candidateId,
              tenant.id,
            ]
          );
        } catch (err) {
          console.warn('Careers apply: resume store failed:', (err as Error).message);
        }
      }
    }

    await pool.query(
      'INSERT INTO activities (type, description, candidate_id, tenant_id) VALUES ($1, $2, $3, $4)',
      [
        'pipeline',
        `${name} applied to ${jobs[0].title} via careers page${isNew ? '' : ' (existing candidate)'}`,
        candidateId,
        tenant.id,
      ]
    );

    if (email) {
      const tpl = applicationReceivedEmail({
        candidateName: name,
        jobTitle: jobs[0].title,
        companyName: tenant.name,
      });
      await sendEmail({
        tenantId: tenant.id,
        to: email,
        template: 'application_received',
        subject: tpl.subject,
        html: tpl.html,
      });
    }

    res.status(201).json({ applied: true, applicationId: candidateId });
  }
);

export default router;
