import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { Storage } from '@google-cloud/storage';
import { DB_SCHEMA, pool as localPool } from '../dbConfig.js';
import { UPLOAD_ROOT } from '../services/fileStorage.js';

const SOURCE_SLUG = 'staffpro-agency';
const TARGET_SLUG = 'harmovia';
const NAME_PREFIX = 'I-';
const GCS_PREFIX = (process.env.GCS_PREFIX || 'resumes').replace(/^\/+|\/+$/g, '');
const execute = process.argv.includes('--execute');
const productionUrl = process.env.PRODUCTION_DATABASE_URL;
const bucketName = process.env.GCS_BUCKET;

if (!productionUrl) throw new Error('PRODUCTION_DATABASE_URL is required.');
if (!bucketName) throw new Error('GCS_BUCKET is required.');

type CandidateRow = Record<string, unknown> & {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  resume_meta: {
    storage_path?: string;
    original_filename?: string;
    mime_type?: string;
    file_size_bytes?: number;
  } | null;
  ats_details: Record<string, unknown> | null;
};

function quoted(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function prefixedName(name: string): string {
  return name.startsWith(NAME_PREFIX) ? name : `${NAME_PREFIX}${name}`;
}

function localResumePath(storagePath: string): string {
  return path.isAbsolute(storagePath) ? storagePath : path.join(UPLOAD_ROOT, storagePath);
}

function tenantImportMarker(sourceTenantId: number, sourceCandidateId: number) {
  return {
    source_tenant_id: sourceTenantId,
    source_candidate_id: sourceCandidateId,
    source_tenant_slug: SOURCE_SLUG,
    imported_at: new Date().toISOString(),
  };
}

async function main() {
  const productionPool = new pg.Pool({ connectionString: productionUrl, max: 2 });
  const storage = new Storage();
  const bucket = storage.bucket(bucketName!);

  try {
    const { rows: sourceTenants } = await localPool.query(
      `SELECT id FROM ${quoted(DB_SCHEMA)}.tenants WHERE slug = $1`,
      [SOURCE_SLUG]
    );
    const sourceTenantId = Number(sourceTenants[0]?.id);
    if (!sourceTenantId) throw new Error(`Local source tenant ${SOURCE_SLUG} was not found.`);

    const { rows: targetTenants } = await productionPool.query(
      `SELECT id FROM ${quoted(DB_SCHEMA)}.tenants WHERE slug = $1`,
      [TARGET_SLUG]
    );
    const targetTenantId = Number(targetTenants[0]?.id);
    if (!targetTenantId) throw new Error(`Production target tenant ${TARGET_SLUG} was not found.`);

    const { rows: admins } = await productionPool.query(
      `SELECT id FROM ${quoted(DB_SCHEMA)}.users
       WHERE tenant_id = $1 AND role = 'admin'
       ORDER BY CASE WHEN email = 'admin@harmovia.com' THEN 0 ELSE 1 END, id
       LIMIT 1`,
      [targetTenantId]
    );
    const targetAdminId = Number(admins[0]?.id);
    if (!targetAdminId) throw new Error('Production Harmovia admin was not found.');

    const { rows: sourceCandidates } = await localPool.query<CandidateRow>(
      `SELECT * FROM ${quoted(DB_SCHEMA)}.candidates WHERE tenant_id = $1 ORDER BY id`,
      [sourceTenantId]
    );

    const [localColumnsResult, productionColumnsResult] = await Promise.all([
      localPool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'candidates'`,
        [DB_SCHEMA]
      ),
      productionPool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'candidates'`,
        [DB_SCHEMA]
      ),
    ]);
    const localColumns = new Set(localColumnsResult.rows.map((row) => String(row.column_name)));
    const jsonColumns = new Set(
      productionColumnsResult.rows
        .filter((row) => ['json', 'jsonb'].includes(String(row.data_type)))
        .map((row) => String(row.column_name))
    );
    const columns = productionColumnsResult.rows
      .map((row) => String(row.column_name))
      .filter((column) => localColumns.has(column) && !['id', 'search_tsv'].includes(column));

    let alreadyImported = 0;
    let duplicatesReused = 0;
    let candidatesImported = 0;
    let resumesUploaded = 0;
    let withoutResume = 0;

    for (const source of sourceCandidates) {
      const existingImport = await productionPool.query(
        `SELECT id FROM ${quoted(DB_SCHEMA)}.candidates
         WHERE tenant_id = $1
           AND ats_details->'tenant_import'->>'source_tenant_id' = $2
           AND ats_details->'tenant_import'->>'source_candidate_id' = $3
         LIMIT 1`,
        [targetTenantId, String(sourceTenantId), String(source.id)]
      );
      if (existingImport.rows[0]) {
        alreadyImported += 1;
        continue;
      }

      const duplicate = await productionPool.query(
        `SELECT id, resume_meta FROM ${quoted(DB_SCHEMA)}.candidates
         WHERE tenant_id = $1 AND (email = $2 OR phone = $3)
         LIMIT 1`,
        [targetTenantId, source.email?.trim() || null, source.phone?.trim() || null]
      );
      if (duplicate.rows[0]) {
        if (execute) {
          await productionPool.query(
            `UPDATE ${quoted(DB_SCHEMA)}.candidates
             SET name = CASE WHEN name LIKE $1 THEN name ELSE $2 || name END,
                 ats_details = COALESCE(ats_details, '{}'::jsonb) ||
                   jsonb_build_object('tenant_import', $3::jsonb),
                 updated_at = NOW()
             WHERE id = $4 AND tenant_id = $5`,
            [ `${NAME_PREFIX}%`, NAME_PREFIX,
              JSON.stringify(tenantImportMarker(sourceTenantId, source.id)),
              duplicate.rows[0].id, targetTenantId ]
          );
        }
        duplicatesReused += 1;
        continue;
      }

      if (!execute) continue;

      const client = await productionPool.connect();
      let uploadedObject: string | null = null;
      try {
        await client.query('BEGIN');
        const values = columns.map((column) => {
          let value: unknown;
          if (column === 'name') value = prefixedName(source.name);
          else if (column === 'tenant_id') value = targetTenantId;
          else if (column === 'recruiter_id') value = targetAdminId;
          else if (column === 'job_id') value = null;
          else if (column === 'stage') value = 'applied';
          else if (column === 'source') value = 'import';
          else if (column === 'resume_meta') value = null;
          if (['hm_notes', 'joined_at', 'offer_status', 'expected_joining_at',
            'screening', 'screening_questions'].includes(column)) value = null;
          else if (column === 'is_hot') value = false;
          else if (column === 'created_at' || column === 'updated_at') value = new Date();
          else if (column === 'ats_details') {
            value = {
              ...(source.ats_details || {}),
              tenant_import: tenantImportMarker(sourceTenantId, source.id),
            };
          } else if (value === undefined) value = source[column] ?? null;
          return jsonColumns.has(column) && value != null ? JSON.stringify(value) : value;
        });
        const placeholders = values.map((_, index) => `$${index + 1}`);
        const inserted = await client.query(
          `INSERT INTO ${quoted(DB_SCHEMA)}.candidates (${columns.map(quoted).join(', ')})
           VALUES (${placeholders.join(', ')}) RETURNING id`,
          values
        );
        const candidateId = Number(inserted.rows[0].id);

        const sourceResumeMeta = source.resume_meta;
        const storagePath = sourceResumeMeta?.storage_path;
        if (storagePath && sourceResumeMeta) {
          const sourcePath = localResumePath(storagePath);
          const extension = path.extname(sourcePath).toLowerCase() || '.pdf';
          const targetKey = `${targetTenantId}/candidates/${candidateId}${extension}`;
          uploadedObject = GCS_PREFIX ? `${GCS_PREFIX}/${targetKey}` : targetKey;
          const stats = await fs.stat(sourcePath);
          await bucket.upload(sourcePath, {
            destination: uploadedObject,
            resumable: false,
            metadata: { contentType: sourceResumeMeta.mime_type || 'application/pdf' },
          });
          const resumeMeta = {
            ...sourceResumeMeta,
            storage_path: targetKey,
            file_size_bytes: stats.size,
          };
          await client.query(
            `UPDATE ${quoted(DB_SCHEMA)}.candidates SET resume_meta = $1::jsonb WHERE id = $2`,
            [JSON.stringify(resumeMeta), candidateId]
          );
          resumesUploaded += 1;
        } else {
          withoutResume += 1;
        }

        await client.query('COMMIT');
        candidatesImported += 1;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (uploadedObject) {
          await bucket.file(uploadedObject).delete({ ignoreNotFound: true }).catch(() => undefined);
        }
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(JSON.stringify({
      mode: execute ? 'execute' : 'dry-run',
      sourceCandidates: sourceCandidates.length,
      targetTenantId,
      targetAdminId,
      candidatesImported,
      resumesUploaded,
      withoutResume,
      duplicatesReused,
      alreadyImported,
      candidatesToImport: sourceCandidates.length - duplicatesReused - alreadyImported,
    }, null, 2));
  } finally {
    await Promise.all([localPool.end(), productionPool.end()]);
  }
}

void main();
