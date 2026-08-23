import { pool } from '../src/dbConfig.js';
import { migrateLinkedInJobPosting } from '../src/migrations/linkedinJobPosting.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO harmirecruit, public');
    await migrateLinkedInJobPosting(client);
    const r = await client.query(`SELECT to_regclass('harmirecruit.job_external_postings') AS t`);
    console.log('job_external_postings:', r.rows[0]?.t);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
