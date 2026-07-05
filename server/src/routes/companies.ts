import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantClause, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

router.get('/', async (req, res) => {
  const { search, status } = req.query;
  const t = tenantClause(tid(req), 'co', 1);
  let sql = `
    SELECT co.*,
      (SELECT COUNT(*)::int FROM jobs j WHERE j.client = co.name AND j.tenant_id = co.tenant_id AND j.status = 'active') AS open_jobs,
      (SELECT u.name FROM users u WHERE u.company_id = co.id AND u.role = 'hiring_manager' LIMIT 1) AS hiring_manager
    FROM companies co
    WHERE ${t.sql}
  `;
  const params: unknown[] = [t.param];
  let i = t.nextIndex;

  if (status) {
    sql += ` AND co.status = $${i++}`;
    params.push(status);
  }
  if (search) {
    sql += ` AND co.name ILIKE $${i++}`;
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY co.name';

  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT co.*,
      (SELECT COUNT(*)::int FROM jobs j WHERE j.client = co.name AND j.tenant_id = co.tenant_id) AS open_jobs
     FROM companies co WHERE co.id = $1 AND co.tenant_id = $2`,
    [req.params.id, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Company not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { name, industry, location, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Company name required' });

  const { rows } = await pool.query(
    `INSERT INTO companies (tenant_id, name, industry, location, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tid(req), name, industry || null, location || null, status || 'active']
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const fields = ['name', 'industry', 'location', 'status'] as const;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      params.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE companies SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Company not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM companies WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    tid(req),
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Company not found' });
  res.status(204).send();
});

export default router;
