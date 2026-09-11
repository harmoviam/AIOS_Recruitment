import fs from 'fs/promises';
import path from 'path';
import { DB_SCHEMA, pool } from '../dbConfig.js';
import { UPLOAD_ROOT } from '../services/fileStorage.js';

const [sourceSlug, targetSlug, namePrefix = ''] = process.argv.slice(2);

if (!sourceSlug || !targetSlug) {
  throw new Error(
    'Usage: tsx src/scripts/copyTenantCandidates.ts <source-slug> <target-slug> [name-prefix]'
  );
}

type CandidateRow = {
  id: number;
  email: string | null;
  phone: string | null;
  resume_meta: {
    storage_path?: string;
    original_filename?: string;
    mime_type?: string;
    file_size_bytes?: number;
  } | null;
};

function quoted(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function absoluteStoragePath(storagePath: string): string {
  return path.isAbsolute(storagePath) ? storagePath : path.join(UPLOAD_ROOT, storagePath);
}

async function main() {
  const client = await pool.connect();
  const copiedFiles: string[] = [];

  try {
    const { rows: tenants } = await client.query(
      `SELECT id, slug FROM ${quoted(DB_SCHEMA)}.tenants WHERE slug = ANY($1::text[])`,
      [[sourceSlug, targetSlug]]
    );
    const sourceTenant = tenants.find((tenant) => tenant.slug === sourceSlug);
    const targetTenant = tenants.find((tenant) => tenant.slug === targetSlug);
    if (!sourceTenant || !targetTenant) throw new Error('Source or target tenant was not found.');
    if (sourceTenant.id === targetTenant.id) throw new Error('Source and target tenants must differ.');

    const { rows: admins } = await client.query(
      `SELECT id FROM ${quoted(DB_SCHEMA)}.users
       WHERE tenant_id = $1 AND role = 'admin' ORDER BY id LIMIT 1`,
      [targetTenant.id]
    );
    if (!admins[0]) throw new Error(`Target tenant ${targetSlug} has no admin user.`);

    const { rows: columnRows } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'candidates'
         AND column_name NOT IN ('id', 'search_tsv')
       ORDER BY ordinal_position`,
      [DB_SCHEMA]
    );
    const columns = columnRows.map((row) => String(row.column_name));
    const overrides: Record<string, string> = {
      tenant_id: '$2',
      recruiter_id: '$3',
      job_id: 'NULL',
      stage: "'applied'",
      source: "'import'",
      resume_meta: 'NULL',
      hm_notes: 'NULL',
      joined_at: 'NULL',
      offer_status: 'NULL',
      expected_joining_at: 'NULL',
      screening: 'NULL',
      screening_questions: 'NULL',
      is_hot: 'FALSE',
      created_at: 'NOW()',
      updated_at: 'NOW()',
      ats_details: `COALESCE(ats_details, '{}'::jsonb) || jsonb_build_object(
        'tenant_import', jsonb_build_object(
          'source_tenant_id', tenant_id,
          'source_candidate_id', id,
          'source_tenant_slug', $4::text,
          'imported_at', NOW()
        )
      )`,
      name: `CASE
        WHEN $5::text = '' OR name LIKE ($5::text || '%') THEN name
        ELSE $5::text || name
      END`,
    };
    const expressions = columns.map((column) => overrides[column] || quoted(column));

    const { rows: candidates } = await client.query<CandidateRow>(
      `SELECT id, email, phone, resume_meta
       FROM ${quoted(DB_SCHEMA)}.candidates WHERE tenant_id = $1 ORDER BY id`,
      [sourceTenant.id]
    );

    await client.query('BEGIN');
    let imported = 0;
    let resumesCopied = 0;
    let reusedDuplicates = 0;
    let alreadyImported = 0;
    let withoutResume = 0;

    for (const candidate of candidates) {
      const prior = await client.query(
        `SELECT id FROM ${quoted(DB_SCHEMA)}.candidates
         WHERE tenant_id = $1
           AND ats_details->'tenant_import'->>'source_tenant_id' = $2
           AND ats_details->'tenant_import'->>'source_candidate_id' = $3
         LIMIT 1`,
        [targetTenant.id, String(sourceTenant.id), String(candidate.id)]
      );
      if (prior.rows[0]) {
        if (namePrefix) {
          await client.query(
            `UPDATE ${quoted(DB_SCHEMA)}.candidates
             SET name = $1 || name, updated_at = NOW()
             WHERE id = $2 AND name NOT LIKE ($1 || '%')`,
            [namePrefix, prior.rows[0].id]
          );
        }
        alreadyImported += 1;
        continue;
      }

      const email = candidate.email?.trim() || null;
      const phone = candidate.phone?.trim() || null;
      const duplicate = await client.query(
        `SELECT id FROM ${quoted(DB_SCHEMA)}.candidates
         WHERE tenant_id = $1 AND (email = $2 OR phone = $3)
         LIMIT 1`,
        [targetTenant.id, email, phone]
      );
      if (duplicate.rows[0]) {
        if (namePrefix) {
          await client.query(
            `UPDATE ${quoted(DB_SCHEMA)}.candidates
             SET name = $1 || name, updated_at = NOW()
             WHERE id = $2 AND name NOT LIKE ($1 || '%')`,
            [namePrefix, duplicate.rows[0].id]
          );
        }
        reusedDuplicates += 1;
        continue;
      }

      const inserted = await client.query(
        `INSERT INTO ${quoted(DB_SCHEMA)}.candidates (${columns.map(quoted).join(', ')})
         SELECT ${expressions.join(', ')}
         FROM ${quoted(DB_SCHEMA)}.candidates WHERE id = $1
         RETURNING id`,
        [candidate.id, targetTenant.id, admins[0].id, sourceSlug, namePrefix]
      );
      const newCandidateId = Number(inserted.rows[0].id);
      imported += 1;

      const storagePath = candidate.resume_meta?.storage_path;
      if (!storagePath) {
        withoutResume += 1;
        continue;
      }

      const sourcePath = absoluteStoragePath(storagePath);
      const extension = path.extname(sourcePath).toLowerCase() || '.pdf';
      const targetKey = `${targetTenant.id}/candidates/${newCandidateId}${extension}`;
      const targetPath = path.join(UPLOAD_ROOT, targetKey);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      copiedFiles.push(targetPath);
      const stats = await fs.stat(targetPath);
      const resumeMeta = {
        ...candidate.resume_meta,
        storage_path: targetKey,
        file_size_bytes: stats.size,
      };
      await client.query(
        `UPDATE ${quoted(DB_SCHEMA)}.candidates SET resume_meta = $1::jsonb WHERE id = $2`,
        [JSON.stringify(resumeMeta), newCandidateId]
      );
      resumesCopied += 1;
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({
      source: sourceSlug,
      target: targetSlug,
      namePrefix,
      sourceCandidates: candidates.length,
      imported,
      resumesCopied,
      withoutResume,
      reusedDuplicates,
      alreadyImported,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await Promise.all(copiedFiles.map((file) => fs.rm(file, { force: true })));
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
