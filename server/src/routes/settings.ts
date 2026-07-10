import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

function adminOnly(req: Request, res: import('express').Response, next: import('express').NextFunction) {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Organization admin access required' });
  }
  next();
}

router.use(adminOnly);

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM settings WHERE tenant_id = $1', [tid(req)]);
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.get('/users/list', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, role, wa_signature, created_at FROM users WHERE tenant_id = $1 ORDER BY name',
    [tid(req)]
  );
  res.json(rows);
});

router.post('/users/list', async (req, res) => {
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

router.put('/:key', async (req, res) => {
  const { key } = req.params;
  const allowed = ['whatsapp', 'branding', 'notifications', 'security'];
  if (!allowed.includes(key)) return res.status(400).json({ error: 'Invalid setting key' });

  await pool.query(
    `INSERT INTO settings (tenant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3`,
    [tid(req), key, JSON.stringify(req.body)]
  );
  res.json({ key, value: req.body });
});

export default router;
