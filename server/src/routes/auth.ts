import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authMiddleware, signToken, toAuthUser } from '../middleware/auth.js';
import { loadTenantBySlug } from '../middleware/tenant.js';
import { emailMode, passwordResetEmail, sendEmail } from '../services/email.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password, workspace } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const ws = (workspace as string | undefined)?.trim().toLowerCase();

  if (ws === 'platform') {
    const { rows } = await pool.query(
      `SELECT u.*, NULL AS tenant_slug FROM users u
       WHERE u.email = $1 AND u.role = 'super_admin' AND u.tenant_id IS NULL`,
      [email]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const authUser = toAuthUser({ ...user, tenant_slug: null });
    return res.json({ token: signToken(authUser), user: authUser });
  }

  if (!ws) return res.status(400).json({ error: 'Workspace slug required' });

  const tenant = await loadTenantBySlug(ws);
  if (!tenant) return res.status(404).json({ error: 'Workspace not found' });

  const { rows } = await pool.query(
    `SELECT u.*, t.slug AS tenant_slug FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.email = $1 AND u.tenant_id = $2`,
    [email, tenant.id]
  );
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const authUser = toAuthUser(user);
  res.json({ token: signToken(authUser), user: authUser });
});

router.post('/register', async (req, res) => {
  const { email, password, name, orgName, workspace } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name required' });
  }

  const slug =
    (workspace as string | undefined)?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') ||
    `org-${Date.now()}`;
  const tenantName = orgName || `${name}'s Agency`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Workspace slug already taken' });
    }

    const { rows: tenantRows } = await client.query(
      `INSERT INTO tenants (slug, name, plan, status, primary_color, logo_initials, features)
       VALUES ($1, $2, 'starter', 'trial', '#2563EB', $3, $4::jsonb) RETURNING id, slug`,
      [slug, tenantName, tenantName.slice(0, 2).toUpperCase(), JSON.stringify(['whatsapp', 'ai_insights', 'reports'])]
    );
    const tenant = tenantRows[0];

    const hash = bcrypt.hashSync(password, 10);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, password_hash, name, role, tenant_id)
       VALUES ($1, $2, $3, 'admin', $4) RETURNING id, email, name, role, tenant_id`,
      [email, hash, name, tenant.id]
    );

    await client.query(
      `INSERT INTO settings (tenant_id, key, value) VALUES
        ($1, 'branding', $2),
        ($1, 'whatsapp', '{"connected": false}')`,
      [tenant.id, JSON.stringify({ companyName: tenantName, primaryColor: '#2563EB' })]
    );

    await client.query('COMMIT');

    const authUser = toAuthUser({ ...userRows[0], tenant_slug: tenant.slug });
    res.status(201).json({ token: signToken(authUser), user: authUser });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Email already registered in this workspace' });
    }
    throw err;
  } finally {
    client.release();
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.phone, u.timezone, u.created_at, t.slug AS tenant_slug
     FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1`,
    [req.user!.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.patch('/me', authMiddleware, async (req, res) => {
  const { name, phone, timezone, password } = req.body;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (name) {
    updates.push(`name = $${i++}`);
    params.push(name);
  }
  if (phone !== undefined) {
    updates.push(`phone = $${i++}`);
    params.push(phone);
  }
  if (timezone) {
    updates.push(`timezone = $${i++}`);
    params.push(timezone);
  }
  if (password) {
    updates.push(`password_hash = $${i++}`);
    params.push(bcrypt.hashSync(password, 10));
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.user!.id);
  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, email, name, role, tenant_id, phone, timezone`,
    params
  );
  res.json(rows[0]);
});

router.post('/forgot-password', async (req, res) => {
  const { email, workspace } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const ws = (workspace as string | undefined)?.trim().toLowerCase();
  let userQuery = 'SELECT id, email FROM users WHERE email = $1';
  const params: unknown[] = [email];

  if (ws && ws !== 'platform') {
    const tenant = await loadTenantBySlug(ws);
    if (!tenant) return res.json({ message: 'If an account exists, a reset link has been sent.' });
    userQuery += ' AND tenant_id = $2';
    params.push(tenant.id);
  } else if (ws === 'platform') {
    userQuery += " AND role = 'super_admin' AND tenant_id IS NULL";
  }

  const { rows } = await pool.query(userQuery, params);
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [rows[0].id, token, expires.toISOString()]
    );
    const resetUrl = `${process.env.APP_URL || 'http://localhost:5173'}/forgot-password?token=${token}`;
    if (emailMode() === 'live') {
      const tpl = passwordResetEmail(resetUrl);
      await sendEmail({
        tenantId: null,
        to: rows[0].email,
        template: 'password_reset',
        subject: tpl.subject,
        html: tpl.html,
      });
      return res.json({ message: 'If an account exists, a reset link has been sent.' });
    }
    // Email not configured: keep the dev-mode reset link, but never in production.
    return res.json({
      message: 'If an account exists, a reset link has been sent.',
      ...(process.env.NODE_ENV !== 'production' ? { resetUrl, token } : {}),
    });
  }
  res.json({ message: 'If an account exists, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { rows } = await pool.query(
    `SELECT prt.*, u.id AS user_id FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token = $1 AND prt.used_at IS NULL AND prt.expires_at > NOW()`,
    [token]
  );
  if (!rows[0]) return res.status(400).json({ error: 'Invalid or expired reset token' });

  const hash = bcrypt.hashSync(password, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].user_id]);
  await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [rows[0].id]);
  res.json({ message: 'Password updated successfully' });
});

export default router;
