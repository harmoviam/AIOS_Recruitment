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

const PUBLIC_JOB_FIELDS = `j.id, j.title, j.location, j.description, j.open_positions, j.created_at`;

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
        return res.status(201).json({ applied: true });
      }
      await pool.query(
        `UPDATE candidates SET job_id = COALESCE(job_id, $1), updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [jobId, candidateId, tenant.id]
      );
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
           stage, job_id, tenant_id, source, parsed_profile)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'applied', $7, $8, 'careers', $9::jsonb)
         RETURNING id, job_id, stage, ai_score, recruiter_id, source`,
        [
          name,
          email || null,
          phone || null,
          JSON.stringify(skills),
          experienceYears,
          heuristicCandidateScore(skills, experienceYears),
          jobId,
          tenant.id,
          parsedProfile ? JSON.stringify(parsedProfile) : null,
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

    res.status(201).json({ applied: true });
  }
);

export default router;
