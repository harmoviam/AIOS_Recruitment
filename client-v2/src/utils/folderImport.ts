import type { ImportFolderCandidate } from '../types';
import { parseCsvRecords } from './candidateImportFormat';

export type FolderPdfStatus = 'matched' | 'missing' | 'ambiguous';

export interface FolderImportRow {
  candidate: ImportFolderCandidate;
  resume: File | null;
  pdfStatus: FolderPdfStatus;
  rowNumber: number;
}

export interface FolderImportInspection {
  folderName: string;
  rows: FolderImportRow[];
  totalFiles: number;
  totalPdfs: number;
}

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function browserRelativePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string };
  return withRelativePath.webkitRelativePath || file.name;
}

function pathInsideSelectedFolder(file: File): string {
  const parts = browserRelativePath(file).split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join('/') : file.name;
}

function normalizeFileReference(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function addToIndex(index: Map<string, File[]>, key: string, file: File) {
  const files = index.get(key) || [];
  files.push(file);
  index.set(key, files);
}

function valueAt(
  columns: string[],
  headerIndexes: Map<string, number>,
  header: string
): string {
  const index = headerIndexes.get(normalizedHeader(header));
  return index == null ? '' : columns[index]?.trim() || '';
}

export async function inspectCandidateImportFolder(
  selectedFiles: File[]
): Promise<FolderImportInspection> {
  if (selectedFiles.length === 0) throw new Error('Choose a folder to continue.');

  const firstPath = browserRelativePath(selectedFiles[0]).split('/').filter(Boolean);
  const folderName = firstPath.length > 1 ? firstPath[0] : 'Selected folder';
  const summaryFiles = selectedFiles.filter(
    (file) => normalizeFileReference(pathInsideSelectedFolder(file)) === 'all_resumes_summary.csv'
  );
  if (summaryFiles.length === 0) {
    throw new Error('The selected folder must contain all_resumes_summary.csv at its top level.');
  }
  if (summaryFiles.length > 1) {
    throw new Error('The selected folder contains more than one all_resumes_summary.csv file.');
  }

  const records = parseCsvRecords(await summaryFiles[0].text());
  if (records.length < 2) throw new Error('all_resumes_summary.csv contains no candidate rows.');

  const headerIndexes = new Map<string, number>();
  records[0].forEach((header, index) => headerIndexes.set(normalizedHeader(header), index));
  if (!headerIndexes.has('filename') || !headerIndexes.has('name')) {
    throw new Error('all_resumes_summary.csv must contain Filename and Name columns.');
  }

  const pdfs = selectedFiles.filter((file) => file.name.toLowerCase().endsWith('.pdf'));
  const pdfsByPath = new Map<string, File[]>();
  const pdfsByName = new Map<string, File[]>();
  for (const pdf of pdfs) {
    addToIndex(pdfsByPath, normalizeFileReference(pathInsideSelectedFolder(pdf)), pdf);
    addToIndex(pdfsByName, pdf.name.toLowerCase(), pdf);
  }

  const rows = records.slice(1).flatMap((columns, recordIndex): FolderImportRow[] => {
    const name = valueAt(columns, headerIndexes, 'Name');
    if (!name) return [];

    const filename = valueAt(columns, headerIndexes, 'Filename');
    const reference = normalizeFileReference(filename);
    const matches = reference.includes('/')
      ? pdfsByPath.get(reference) || []
      : pdfsByName.get(reference) || [];

    return [{
      candidate: {
        filename,
        name,
        email: valueAt(columns, headerIndexes, 'Email'),
        phone: valueAt(columns, headerIndexes, 'Phone'),
        role: valueAt(columns, headerIndexes, 'Role'),
        experience: valueAt(columns, headerIndexes, 'Experience'),
        education: valueAt(columns, headerIndexes, 'Education'),
        skills: valueAt(columns, headerIndexes, 'Skills'),
        summary: valueAt(columns, headerIndexes, 'Summary'),
      },
      resume: matches.length === 1 ? matches[0] : null,
      pdfStatus: matches.length === 1 ? 'matched' : matches.length > 1 ? 'ambiguous' : 'missing',
      rowNumber: recordIndex + 2,
    }];
  });

  if (rows.length === 0) throw new Error('No named candidates were found in all_resumes_summary.csv.');
  return {
    folderName,
    rows,
    totalFiles: selectedFiles.length,
    totalPdfs: pdfs.length,
  };
}
