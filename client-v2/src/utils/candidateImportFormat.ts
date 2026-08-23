/** VGM / Harmovia export format — 15 columns, duplicate header names in source file. */
export const VGM_RAW_HEADERS = [
  'candidateName',
  'candidateEmail',
  'candidatePhone',
  'jobTitle',
  'companyName',
  'location',
  'currentStatus',
  'sourcedBy',
  'sourcedBy',
  'lvl1manager',
  'lvl1manager',
  'lvl2manager',
  'lvl2manager',
  'appliedOn',
  'interviewDate',
] as const;

export const VGM_CANONICAL_COLUMNS = [
  'candidateName',
  'candidateEmail',
  'candidatePhone',
  'jobTitle',
  'companyName',
  'location',
  'currentStatus',
  'sourcedBy',
  'sourcedByPhone',
  'lvl1managerName',
  'lvl1managerPhone',
  'lvl2managerName',
  'lvl2managerPhone',
  'appliedOn',
  'interviewDate',
] as const;

export type VgmCanonicalColumn = (typeof VGM_CANONICAL_COLUMNS)[number];

export const VGM_COLUMN_LABELS: Record<VgmCanonicalColumn, string> = {
  candidateName: 'Candidate name *',
  candidateEmail: 'Candidate email',
  candidatePhone: 'Candidate phone *',
  jobTitle: 'Job title *',
  companyName: 'Company name',
  location: 'Location',
  currentStatus: 'Current status',
  sourcedBy: 'Sourced by',
  sourcedByPhone: 'Sourced by phone',
  lvl1managerName: 'L1 manager',
  lvl1managerPhone: 'L1 manager phone',
  lvl2managerName: 'L2 manager',
  lvl2managerPhone: 'L2 manager phone',
  appliedOn: 'Applied on',
  interviewDate: 'Interview date',
};

const VGM_TEMPLATE_SAMPLE = [
  'krishn om',
  'omkrishna3@gmail.com',
  '6394303329',
  'Telecaller',
  'VGM Consultants Limited',
  'Noida',
  'Interview Scheduled',
  'Siddharth Saini',
  '9286424426',
  'NIDHI NAUTIYAL',
  '9056283866',
  'Mohali Franc',
  '9056283266',
  '2026-06-22T00:00:00.000Z',
  '2026-06-22T00:00:00.000Z',
];

/** Parse RFC-4180-style CSV, including quoted newlines and escaped quotes. */
export function parseCsvRecords(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  const finishField = () => {
    record.push(field.trim());
    field = '';
  };
  const finishRecord = () => {
    finishField();
    if (record.some((value) => value.length > 0)) records.push(record);
    record = [];
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (inQuotes && source[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      finishField();
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      finishRecord();
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || record.length > 0) finishRecord();
  return records;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isVgmImportFormat(headers: string[]): boolean {
  if (headers.length < 14) return false;
  const normalized = headers.map(normalizeHeader);
  const hasCandidate =
    normalized.some((h) => h.startsWith('candidatename') || h.startsWith('candidatena')) &&
    normalized.some((h) => h.startsWith('candidatephone') || h.startsWith('candidateph'));
  const hasJob = normalized.some((h) => h === 'jobtitle' || h.startsWith('jobtitle'));
  const hasCompany = normalized.some((h) => h === 'companyname' || h.startsWith('companyname'));
  const hasStatus = normalized.some((h) => h === 'currentstatus' || h.startsWith('currentstatus'));
  return hasCandidate && hasJob && hasCompany && hasStatus;
}

function rowFromColumns(cols: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  VGM_CANONICAL_COLUMNS.forEach((key, i) => {
    row[key] = cols[i]?.trim() || '';
  });
  return row;
}

export function parseCandidateImportCsv(text: string): {
  rows: Record<string, string>[];
  format: 'vgm' | 'generic';
  headers: string[];
} {
  const records = parseCsvRecords(text);
  if (records.length < 2) return { rows: [], format: 'generic', headers: [] };

  const rawHeaders = records[0];
  const vgmFormat = isVgmImportFormat(rawHeaders);

  const rows = records.slice(1).map((cols) => {
    if (vgmFormat) return rowFromColumns(cols);

    const row: Record<string, string> = {};
    rawHeaders.forEach((h, i) => {
      row[h] = cols[i]?.trim() || '';
    });
    return row;
  });

  return {
    rows,
    format: vgmFormat ? 'vgm' : 'generic',
    headers: vgmFormat ? [...VGM_CANONICAL_COLUMNS] : rawHeaders,
  };
}

export function buildVgmTemplateCsv(): string {
  const headerLine = VGM_RAW_HEADERS.join(',');
  const sampleLine = VGM_TEMPLATE_SAMPLE.map((v) => `"${v}"`).join(',');
  return `${headerLine}\n${sampleLine}`;
}
