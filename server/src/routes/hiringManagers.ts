import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';
import { sendEmail, userInviteEmail } from '../services/email.js';
import { appPublicUrl } from '../services/livekit.js';
import { enforceUserLimit } from '../middleware/planLimits.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

router.get('/', async (req, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Organization Admin access required' });
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.company_id,
      co.name AS company,
      (SELECT COUNT(*)::int FROM jobs j WHERE j.client = co.name AND j.tenant_id = u.tenant_id AND j.status = 'active') AS open_jobs,
      (SELECT COUNT(*)::int FROM candidates c WHERE c.stage = 'selected' AND c.tenant_id = u.tenant_id) AS pending_reviews,
      (SELECT COUNT(*)::int FROM users r WHERE r.tenant_id = u.tenant_id AND r.role = 'recruiter'
        AND (r.managed_by_id = u.id OR (r.managed_by_id IS NULL AND r.company_id = u.company_id))) AS recruiter_count,
      (SELECT COUNT(*)::int FROM candidates c JOIN users r ON r.id = c.recruiter_id
        WHERE c.tenant_id = u.tenant_id
          AND (r.managed_by_id = u.id OR (r.managed_by_id IS NULL AND r.company_id = u.company_id))
        AND c.stage = 'joined' AND c.updated_at >= DATE_TRUNC('month', NOW())) AS team_joinings_mtd
     FROM users u
     LEFT JOIN companies co ON co.id = u.company_id
     WHERE u.tenant_id = $1 AND u.role = 'hiring_manager'
     ORDER BY u.name`,
    [tid(req)]
  );
  res.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    company: r.company || '—',
    openJobs: r.open_jobs || 0,
    pendingReviews: r.pending_reviews || 0,
    recruiterCount: r.recruiter_count || 0,
    teamJoiningsMtd: r.team_joinings_mtd || 0,
    status: 'active',
    company_id: r.company_id,
  })));
});

router.post('/', enforceUserLimit(), async (req, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Organization Admin access required' });
  }
  const { email, password, name, company_id } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name required' });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, tenant_id, company_id)
       VALUES ($1, $2, $3, 'hiring_manager', $4, $5) RETURNING id, email, name, role, company_id`,
      [email, hash, name, tid(req), company_id || null]
    );
    const tpl = userInviteEmail({
      name,
      email,
      workspaceName: req.tenant!.name,
      loginUrl: `${appPublicUrl(req)}/login/${req.tenant!.slug}`,
    });
    await sendEmail({
      tenantId: tid(req),
      to: email,
      template: 'user_invite',
      subject: tpl.subject,
      html: tpl.html,
    });
    res.status(201).json(rows[0]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Organization Admin access required' });
  }
  const { name, company_id, password } = req.body;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (name) {
    updates.push(`name = $${i++}`);
    params.push(name);
  }
  if (company_id !== undefined) {
    updates.push(`company_id = $${i++}`);
    params.push(company_id || null);
  }
  if (password) {
    updates.push(`password_hash = $${i++}`);
    params.push(bcrypt.hashSync(password, 10));
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam} AND role = 'hiring_manager' RETURNING id, email, name, company_id`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Hiring manager not found' });
  res.json(rows[0]);
});

export default router;
