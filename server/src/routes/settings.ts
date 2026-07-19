import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { publicTenantLogoUrl, requireTenant, tenantMiddleware } from '../middleware/tenant.js';
import { sendEmail, userInviteEmail } from '../services/email.js';
import { appPublicUrl } from '../services/livekit.js';
import { enforceUserLimit } from '../middleware/planLimits.js';
import {
  ALLOWED_LOGO_MIME_TYPES,
  isAllowedLogoMimeType,
  LOGO_MAX_BYTES,
  saveTenantLogo,
} from '../services/fileStorage.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES },
});

function adminOnly(req: Request, res: import('express').Response, next: import('express').NextFunction) {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Organization admin access required' });
  }
  next();
}

router.use(adminOnly);

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AI';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM settings WHERE tenant_id = $1', [tid(req)]);
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  const t = req.tenant!;
  settings.branding = {
    ...(typeof settings.branding === 'object' && settings.branding ? (settings.branding as object) : {}),
    companyName: t.name,
    primaryColor: t.primary_color,
    logoInitials: t.logo_initials,
    logoUrl: publicTenantLogoUrl(t.slug, t.logo_path),
  };
  res.json(settings);
});

router.get('/users/list', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, role, wa_signature, created_at FROM users WHERE tenant_id = $1 ORDER BY name',
    [tid(req)]
  );
  res.json(rows);
});

router.post('/users/list', enforceUserLimit(), async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name required' });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name, role, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role',
      [email, hash, name, role || 'recruiter', tid(req)]
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
      return res.status(409).json({ error: 'Email already registered in this workspace' });
    }
    throw err;
  }
});

router.patch('/users/list/:id', async (req, res) => {
  const { name, role, password, wa_signature } = req.body;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (name) {
    updates.push(`name = $${i++}`);
    params.push(name);
  }
  if (role) {
    updates.push(`role = $${i++}`);
    params.push(role);
  }
  if (password) {
    updates.push(`password_hash = $${i++}`);
    params.push(bcrypt.hashSync(password, 10));
  }
  if (wa_signature !== undefined) {
    // Empty string clears the custom signature → falls back to the user's name
    updates.push(`wa_signature = $${i++}`);
    params.push(wa_signature?.trim() || null);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam} RETURNING id, email, name, role, wa_signature`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Logo file required' });
  if (!isAllowedLogoMimeType(file.mimetype)) {
    return res.status(400).json({
      error: `Unsupported file type. Allowed: ${Object.keys(ALLOWED_LOGO_MIME_TYPES).join(', ')}`,
    });
  }

  const { storagePath } = await saveTenantLogo(tid(req), file.buffer, file.mimetype);
  await pool.query('UPDATE tenants SET logo_path = $1 WHERE id = $2', [storagePath, tid(req)]);

  const logoUrl = publicTenantLogoUrl(req.tenant!.slug, storagePath);
  const existing = await pool.query(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'branding'`,
    [tid(req)]
  );
  const prev =
    existing.rows[0]?.value && typeof existing.rows[0].value === 'object'
      ? (existing.rows[0].value as Record<string, unknown>)
      : {};
  const next = { ...prev, logoUrl };
  await pool.query(
    `INSERT INTO settings (tenant_id, key, value) VALUES ($1, 'branding', $2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2`,
    [tid(req), JSON.stringify(next)]
  );

  req.tenant!.logo_path = storagePath;
  res.json({ logoUrl });
});

router.delete('/logo', async (req, res) => {
  await pool.query('UPDATE tenants SET logo_path = NULL WHERE id = $1', [tid(req)]);
  const existing = await pool.query(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'branding'`,
    [tid(req)]
  );
  const prev =
    existing.rows[0]?.value && typeof existing.rows[0].value === 'object'
      ? (existing.rows[0].value as Record<string, unknown>)
      : {};
  const { logoUrl: _drop, ...rest } = prev;
  await pool.query(
    `INSERT INTO settings (tenant_id, key, value) VALUES ($1, 'branding', $2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2`,
    [tid(req), JSON.stringify(rest)]
  );
  req.tenant!.logo_path = null;
  res.json({ logoUrl: null });
});

router.put('/:key', async (req, res) => {
  const { key } = req.params;
  const allowed = ['whatsapp', 'branding', 'notifications', 'security'];
  if (!allowed.includes(key)) return res.status(400).json({ error: 'Invalid setting key' });

  let value = req.body;
  if (key === 'branding') {
    const companyName =
      typeof req.body.companyName === 'string' ? req.body.companyName.trim() : undefined;
    const primaryColor =
      typeof req.body.primaryColor === 'string' ? req.body.primaryColor.trim() : undefined;
    const logoInitials =
      typeof req.body.logoInitials === 'string' ? req.body.logoInitials.trim() : undefined;

    if (companyName || primaryColor || logoInitials) {
      const nextName = companyName || req.tenant!.name;
      const nextColor = primaryColor || req.tenant!.primary_color;
      const nextInitials =
        logoInitials ||
        (companyName ? initialsFromName(companyName) : req.tenant!.logo_initials);
      await pool.query(
        `UPDATE tenants SET name = $1, primary_color = $2, logo_initials = $3 WHERE id = $4`,
        [nextName, nextColor, nextInitials.slice(0, 3), tid(req)]
      );
      req.tenant!.name = nextName;
      req.tenant!.primary_color = nextColor;
      req.tenant!.logo_initials = nextInitials.slice(0, 3);
    }

    value = {
      ...req.body,
      companyName: req.tenant!.name,
      primaryColor: req.tenant!.primary_color,
      logoInitials: req.tenant!.logo_initials,
      logoUrl: publicTenantLogoUrl(req.tenant!.slug, req.tenant!.logo_path),
    };
  }

  await pool.query(
    `INSERT INTO settings (tenant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3`,
    [tid(req), key, JSON.stringify(value)]
  );
  res.json({ key, value });
});

export default router;
