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

export function isAllowedMimeType(mimeType: string): boolean {
  return mimeType in ALLOWED_MIME_TYPES;
}

function pendingDir(tenantId: number): string {
  return path.join(UPLOAD_ROOT, String(tenantId), 'pending');
}

function candidateDir(tenantId: number): string {
  return path.join(UPLOAD_ROOT, String(tenantId), 'candidates');
}

/** Save uploaded resume to tenant pending folder before candidate is created. */
export async function savePendingResume(
  tenantId: number,
  buffer: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<{ pendingId: string; storagePath: string; ext: string }> {
  const pendingId = crypto.randomUUID();
  const ext =
    ALLOWED_MIME_TYPES[mimeType] || path.extname(originalFilename).toLowerCase() || '.bin';
  const dir = pendingDir(tenantId);
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${pendingId}${ext}`);
  await fs.writeFile(storagePath, buffer);
  return { pendingId, storagePath, ext };
}

/** Move pending upload to permanent candidate folder after create. */
export async function finalizePendingResume(
  tenantId: number,
  pendingId: string,
  candidateId: number,
  ext: string
): Promise<string> {
  const pendingPath = path.join(pendingDir(tenantId), `${pendingId}${ext}`);
  const dir = candidateDir(tenantId);
  await fs.mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, `${candidateId}${ext}`);
  await fs.rename(pendingPath, finalPath);
  return finalPath;
}

/** Replace stored resume file for an existing candidate (reparse with new upload). */
export async function saveCandidateResume(
  tenantId: number,
  candidateId: number,
  buffer: Buffer,
  ext: string
): Promise<string> {
  const dir = candidateDir(tenantId);
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${candidateId}${ext}`);
  await fs.writeFile(storagePath, buffer);
  return storagePath;
}

export async function readResumeFile(storagePath: string): Promise<Buffer> {
  return fs.readFile(storagePath);
}

export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    await fs.access(storagePath);
    return true;
  } catch {
    return false;
  }
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
