import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantClause, tenantMiddleware } from '../middleware/tenant.js';
import {
  findNearbyCompanies,
  parseMaxDistanceKm,
  type CompanyGeoRow,
  type NearbyCompaniesResult,
} from '../services/nearbyCompanies.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

const COMPANY_LIST_SELECT = `
  SELECT co.*,
    (SELECT COUNT(*)::int FROM jobs j WHERE j.client = co.name AND j.tenant_id = co.tenant_id AND j.status = 'active') AS open_jobs,
    (SELECT u.name FROM users u WHERE u.company_id = co.id AND u.role = 'hiring_manager' LIMIT 1) AS hiring_manager
  FROM companies co
`;

function validateCompanyLocation(body: Record<string, unknown>, isCreate: boolean): string | null {
  const hasLocationText =
    (typeof body.location === 'string' && body.location.trim() !== '') ||
    (typeof body.address === 'string' && body.address.trim() !== '');
  const lat = body.latitude != null ? Number(body.latitude) : null;
  const lng = body.longitude != null ? Number(body.longitude) : null;
  const hasCoords =
    lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);

  if (isCreate && hasLocationText && !hasCoords) {
    return 'latitude and longitude are required when setting a company location (use Google Maps picker)';
  }
  if (body.latitude !== undefined || body.longitude !== undefined) {
    if (!hasCoords) return 'latitude and longitude must be valid numbers';
    if (lat! < -90 || lat! > 90) return 'latitude must be between -90 and 90';
    if (lng! < -180 || lng! > 180) return 'longitude must be between -180 and 180';
  }
  return null;
}

async function loadGeoCompanies(tenantId: number): Promise<CompanyGeoRow[]> {
  const { rows } = await pool.query(
    `${COMPANY_LIST_SELECT}
     WHERE co.tenant_id = $1
       AND co.status = 'active'
       AND co.latitude IS NOT NULL
       AND co.longitude IS NOT NULL
     ORDER BY co.name`,
    [tenantId]
  );
  return rows as CompanyGeoRow[];
}

function buildNearbyResult(
  lat: number,
  lng: number,
  companies: CompanyGeoRow[],
  maxDistanceKm: number,
  message?: string
): NearbyCompaniesResult {
  return {
    companies: findNearbyCompanies(lat, lng, companies, maxDistanceKm),
    origin: { latitude: lat, longitude: lng },
    max_distance_km: maxDistanceKm,
    ...(message ? { message } : {}),
  };
}

/** Nearby companies by raw lat/lng (used while adding a candidate before save). */
router.get('/nearby', async (req, res) => {
  const lat = req.query.lat != null ? Number(req.query.lat) : NaN;
  const lng = req.query.lng != null ? Number(req.query.lng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'lat/lng out of range' });
  }

  const maxDistanceKm = parseMaxDistanceKm(req.query.max_distance_km);
  const companies = await loadGeoCompanies(tid(req));
  res.json(buildNearbyResult(lat, lng, companies, maxDistanceKm));
});

/** Nearby companies relative to a candidate's stay location. */
router.get('/near/:candidateId', async (req, res) => {
  const candidateId = Number(req.params.candidateId);
  if (!Number.isFinite(candidateId)) {
    return res.status(400).json({ error: 'Invalid candidate id' });
  }

  const { rows: candRows } = await pool.query(
    `SELECT id, latitude, longitude, current_location
     FROM candidates WHERE id = $1 AND tenant_id = $2`,
    [candidateId, tid(req)]
  );
  const candidate = candRows[0];
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const lat = candidate.latitude != null ? Number(candidate.latitude) : NaN;
  const lng = candidate.longitude != null ? Number(candidate.longitude) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: 'Candidate stay location is missing coordinates. Select a Google Maps place for current location.',
      code: 'MISSING_CANDIDATE_GEO',
    });
  }

  const maxDistanceKm = parseMaxDistanceKm(req.query.max_distance_km);
  const companies = await loadGeoCompanies(tid(req));
  res.json(buildNearbyResult(lat, lng, companies, maxDistanceKm));
});

router.get('/', async (req, res) => {
  const { search, status } = req.query;
  const t = tenantClause(tid(req), 'co', 1);
  let sql = `${COMPANY_LIST_SELECT} WHERE ${t.sql}`;
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
    `${COMPANY_LIST_SELECT}
     WHERE co.id = $1 AND co.tenant_id = $2`,
    [req.params.id, tid(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Company not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const { name, industry, location, status } = body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Company name required' });
  }

  const locErr = validateCompanyLocation(body, true);
  if (locErr) return res.status(400).json({ error: locErr });

  const { rows } = await pool.query(
    `INSERT INTO companies (
       tenant_id, name, industry, location, status,
       latitude, longitude, address, city, state, country, pincode
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      tid(req),
      name,
      industry || null,
      location || null,
      status || 'active',
      body.latitude != null ? Number(body.latitude) : null,
      body.longitude != null ? Number(body.longitude) : null,
      body.address || null,
      body.city || null,
      body.state || null,
      body.country || null,
      body.pincode || null,
    ]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const locErr = validateCompanyLocation(body, false);
  if (locErr) return res.status(400).json({ error: locErr });

  const fields = [
    'name',
    'industry',
    'location',
    'status',
    'latitude',
    'longitude',
    'address',
    'city',
    'state',
    'country',
    'pincode',
  ] as const;
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  for (const f of fields) {
    if (body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      if (f === 'latitude' || f === 'longitude') {
        params.push(body[f] == null ? null : Number(body[f]));
      } else {
        params.push(body[f]);
      }
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
