import { initDb, pool } from '../db.js';

async function main() {
  await initDb();
  const tenantSlug = 'harmovia';
  const result = await pool.query(
    `INSERT INTO harmovia_candidate_sync_outbox (
       tenant_id, candidate_id, status, attempts, next_attempt_at,
       last_error, delivered_at, updated_at
     )
     SELECT c.tenant_id, c.id, 'pending', 0, NOW(), NULL, NULL, NOW()
     FROM candidates c
     JOIN tenants t ON t.id = c.tenant_id
     WHERE LOWER(t.slug) = $1
     ORDER BY c.created_at ASC, c.id ASC
     ON CONFLICT (candidate_id) DO UPDATE SET
       status = 'pending', attempts = 0, next_attempt_at = NOW(),
       last_error = NULL, delivered_at = NULL, updated_at = NOW()`,
    [tenantSlug],
  );
  console.log(`Queued ${result.rowCount || 0} Harmovia candidate sync record(s) for tenant ${tenantSlug}.`);
}

main()
  .catch((error) => {
    console.error('Harmovia candidate backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
