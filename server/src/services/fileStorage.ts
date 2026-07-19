import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOAD_ROOT =
  process.env.RESUME_UPLOAD_DIR || path.join(__dirname, '../../uploads');

export const RESUME_MAX_BYTES = (Number(process.env.RESUME_MAX_SIZE_MB) || 10) * 1024 * 1024;

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
};

export const LOGO_MAX_BYTES = (Number(process.env.LOGO_MAX_SIZE_MB) || 2) * 1024 * 1024;

export const ALLOWED_LOGO_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export function isAllowedMimeType(mimeType: string): boolean {
  return mimeType in ALLOWED_MIME_TYPES;
}

export function isAllowedLogoMimeType(mimeType: string): boolean {
  return mimeType in ALLOWED_LOGO_MIME_TYPES;
}

/**
 * Storage backend for resume files.
 *
 * Two drivers, selected by env (mirrors the WhatsApp/AI live-vs-local pattern):
 *  - GCS_BUCKET set  -> Google Cloud Storage. Durable across Cloud Run
 *    restarts/scale-to-zero and shared between instances (the pending-upload ->
 *    finalize flow spans two requests that may land on different instances).
 *  - otherwise       -> local disk under UPLOAD_ROOT (dev default).
 *
 * Files are addressed by tenant-scoped relative keys
 * (`{tenantId}/pending/{uuid}{ext}`, `{tenantId}/candidates/{id}{ext}`) which
 * are what gets persisted in candidates.resume_meta.storage_path. Rows written
 * before this driver existed hold absolute local paths — readers accept both.
 */
interface StorageDriver {
  put(key: string, buffer: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  move(fromKey: string, toKey: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

class LocalDiskDriver implements StorageDriver {
  private abs(key: string): string {
    return path.join(UPLOAD_ROOT, key);
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    const target = this.abs(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.abs(key));
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const target = this.abs(toKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(this.abs(fromKey), target);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }
}

class GcsDriver implements StorageDriver {
  private bucketName: string;
  private prefix: string;
  private bucketPromise: Promise<import('@google-cloud/storage').Bucket> | null = null;

  constructor(bucketName: string) {
    this.bucketName = bucketName;
    this.prefix = (process.env.GCS_PREFIX || 'resumes').replace(/\/+$/, '');
  }

  private async bucket() {
    if (!this.bucketPromise) {
      this.bucketPromise = import('@google-cloud/storage').then(
        ({ Storage }) => new Storage().bucket(this.bucketName)
      );
    }
    return this.bucketPromise;
  }

  private object(key: string) {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async put(key: string, buffer: Buffer, contentType?: string): Promise<void> {
    const bucket = await this.bucket();
    await bucket.file(this.object(key)).save(buffer, {
      contentType,
      resumable: false,
    });
  }

  async get(key: string): Promise<Buffer> {
    const bucket = await this.bucket();
    const [contents] = await bucket.file(this.object(key)).download();
    return contents;
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const bucket = await this.bucket();
    await bucket.file(this.object(fromKey)).move(this.object(toKey));
  }

  async exists(key: string): Promise<boolean> {
    const bucket = await this.bucket();
    const [found] = await bucket.file(this.object(key)).exists();
    return found;
  }
}

let driver: StorageDriver | null = null;
function getDriver(): StorageDriver {
  if (!driver) {
    driver = process.env.GCS_BUCKET ? new GcsDriver(process.env.GCS_BUCKET) : new LocalDiskDriver();
  }
  return driver;
}

export function storageMode(): 'gcs' | 'local' {
  return process.env.GCS_BUCKET ? 'gcs' : 'local';
}

function pendingKey(tenantId: number, pendingId: string, ext: string): string {
  return `${tenantId}/pending/${pendingId}${ext}`;
}

function candidateKey(tenantId: number, candidateId: number, ext: string): string {
  return `${tenantId}/candidates/${candidateId}${ext}`;
}

function brandingLogoKey(tenantId: number, ext: string): string {
  return `${tenantId}/branding/logo-${crypto.randomUUID()}${ext}`;
}

/** True for resume_meta.storage_path values written before relative keys existed. */
function isLegacyAbsolutePath(storagePath: string): boolean {
  return path.isAbsolute(storagePath);
}

/** Save uploaded resume to tenant pending area before candidate is created. */
export async function savePendingResume(
  tenantId: number,
  buffer: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<{ pendingId: string; storagePath: string; ext: string }> {
  const pendingId = crypto.randomUUID();
  const ext =
    ALLOWED_MIME_TYPES[mimeType] || path.extname(originalFilename).toLowerCase() || '.bin';
  const key = pendingKey(tenantId, pendingId, ext);
  await getDriver().put(key, buffer, mimeType);
  return { pendingId, storagePath: key, ext };
}

/** Move pending upload to permanent candidate location after create. Returns storage key. */
export async function finalizePendingResume(
  tenantId: number,
  pendingId: string,
  candidateId: number,
  ext: string
): Promise<string> {
  const finalKey = candidateKey(tenantId, candidateId, ext);
  await getDriver().move(pendingKey(tenantId, pendingId, ext), finalKey);
  return finalKey;
}

/** Replace stored resume file for an existing candidate (reparse with new upload). */
export async function saveCandidateResume(
  tenantId: number,
  candidateId: number,
  buffer: Buffer,
  ext: string,
  mimeType?: string
): Promise<string> {
  const key = candidateKey(tenantId, candidateId, ext);
  await getDriver().put(key, buffer, mimeType);
  return key;
}

export async function readResumeFile(storagePath: string): Promise<Buffer> {
  if (isLegacyAbsolutePath(storagePath)) {
    return fs.readFile(storagePath);
  }
  return getDriver().get(storagePath);
}

/** Save company logo under tenant branding area. Returns relative storage key. */
export async function saveTenantLogo(
  tenantId: number,
  buffer: Buffer,
  mimeType: string
): Promise<{ storagePath: string; ext: string }> {
  const ext = ALLOWED_LOGO_MIME_TYPES[mimeType];
  if (!ext) throw new Error('Unsupported logo type. Use PNG, JPEG, or WebP.');
  const key = brandingLogoKey(tenantId, ext);
  await getDriver().put(key, buffer, mimeType);
  return { storagePath: key, ext };
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return readResumeFile(storagePath);
}

export async function fileExists(storagePath: string): Promise<boolean> {
  if (isLegacyAbsolutePath(storagePath)) {
    try {
      await fs.access(storagePath);
      return true;
    } catch {
      return false;
    }
  }
  return getDriver().exists(storagePath);
}

/** Extract plain text from PDF, DOC, or DOCX buffer. */
export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const data = await parser.getText();
      return data.text?.trim() || '';
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || '';
  }

  throw new Error('Unsupported file type. Use PDF, DOC, or DOCX.');
}
