import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM activities WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50',
    [tid(req)]
  );
  res.json(rows);
});

export default router;
