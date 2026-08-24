import ExcelJS from 'exceljs';

export interface ResumeExportJob {
  id: number;
  title: string;
  client: string;
  location: string;
}

export interface ResumeExportRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  effective_status: string;
  hiring_manager_name: string | null;
  recruiter_name: string | null;
  experience_years: number | null;
  current_company: string | null;
  current_location: string | null;
  preferred_location: string | null;
  notice_period: string | null;
  current_salary: string | null;
  salary_expectation: string | null;
  highest_qualification: string | null;
  skills: unknown;
  technical_skills: unknown;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  ats_score: number | null;
  ai_score: number | null;
  resume_filename: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const DEFAULT_BRAND = '2563EB';
const LIGHT_FILL = 'EFF6FF';
const BORDER = 'D6DEE8';

function argb(hex?: string | null): string {
  const normalized = String(hex || '').replace('#', '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : DEFAULT_BRAND;
}

function list(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return Object.values(value).map(String).filter(Boolean).join(', ');
  return value == null ? '' : String(value);
}

function dateValue(value: Date | string): Date | string {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed;
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function styleTitle(row: ExcelJS.Row, brand: string) {
  row.height = 28;
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${brand}` } };
}

function styleHeader(row: ExcelJS.Row, brand: string) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${brand}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${BORDER}` } },
      left: { style: 'thin', color: { argb: `FF${BORDER}` } },
      bottom: { style: 'thin', color: { argb: `FF${BORDER}` } },
      right: { style: 'thin', color: { argb: `FF${BORDER}` } },
    };
  });
}

function styleBodyRow(row: ExcelJS.Row, index: number) {
  row.alignment = { vertical: 'top', wrapText: true };
  row.eachCell((cell) => {
    if (index % 2 === 0) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LIGHT_FILL}` } };
    }
    cell.border = {
      bottom: { style: 'hair', color: { argb: `FF${BORDER}` } },
    };
  });
}

export async function buildResumeWorkbook(input: {
  tenantName: string;
  brandColor?: string | null;
  job: ResumeExportJob;
  rows: ResumeExportRow[];
}): Promise<Buffer> {
  const { tenantName, job, rows } = input;
  const brand = argb(input.brandColor);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AIOS Recruitment';
  workbook.company = tenantName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const statusCounts = new Map<string, number>();
  const recruiterCounts = new Map<string, number>();
  for (const row of rows) {
    statusCounts.set(row.effective_status, (statusCounts.get(row.effective_status) || 0) + 1);
    const owner = row.recruiter_name || 'Unassigned Recruiter';
    recruiterCounts.set(owner, (recruiterCounts.get(owner) || 0) + 1);
  }

  const summary = workbook.addWorksheet('Resume Summary', {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { defaultRowHeight: 20 },
  });
  summary.columns = [
    { width: 28 }, { width: 18 }, { width: 4 }, { width: 30 }, { width: 18 }, { width: 18 },
  ];
  summary.mergeCells('A1:F1');
  summary.getCell('A1').value = `${tenantName} — Job Resume Export`;
  styleTitle(summary.getRow(1), brand);
  summary.getCell('A3').value = 'Job';
  summary.getCell('B3').value = job.title;
  summary.getCell('D3').value = 'Client';
  summary.getCell('E3').value = job.client || '—';
  summary.getCell('A4').value = 'Location';
  summary.getCell('B4').value = job.location || '—';
  summary.getCell('D4').value = 'Generated';
  summary.getCell('E4').value = new Date();
  summary.getCell('E4').numFmt = 'dd-mmm-yyyy hh:mm';
  summary.getCell('A5').value = 'Uploaded resumes';
  summary.getCell('B5').value = rows.length;
  for (const address of ['A3', 'A4', 'A5', 'D3', 'D4']) summary.getCell(address).font = { bold: true };
  summary.getCell('B5').font = { bold: true, size: 14, color: { argb: `FF${brand}` } };

  summary.getCell('A7').value = 'Status';
  summary.getCell('B7').value = 'Resume Count';
  summary.getCell('D7').value = 'Recruiter';
  summary.getCell('E7').value = 'Resume Count';
  styleHeader(summary.getRow(7), brand);
  const statuses = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);
  const recruiters = [...recruiterCounts.entries()].sort((a, b) => b[1] - a[1]);
  const summaryRows = Math.max(statuses.length, recruiters.length, 1);
  for (let index = 0; index < summaryRows; index++) {
    const rowNumber = 8 + index;
    summary.getCell(rowNumber, 1).value = statuses[index] ? titleCase(statuses[index][0]) : '';
    summary.getCell(rowNumber, 2).value = statuses[index]?.[1] ?? '';
    summary.getCell(rowNumber, 4).value = recruiters[index]?.[0] ?? '';
    summary.getCell(rowNumber, 5).value = recruiters[index]?.[1] ?? '';
    styleBodyRow(summary.getRow(rowNumber), index);
  }

  const details = workbook.addWorksheet('Resume Details', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 20 },
  });
  const columns = [
    ['S.No.', 8], ['Candidate ID', 12], ['Candidate Name', 24], ['Email', 28], ['Phone', 18],
    ['Job', 25], ['Client', 22], ['Status', 20], ['Hiring Manager', 23], ['Recruiter', 23],
    ['Experience (Years)', 16], ['Current Company', 22], ['Current Location', 20],
    ['Preferred Location', 20], ['Notice Period', 16], ['Current Salary', 16],
    ['Expected Salary', 18], ['Highest Qualification', 22], ['Skills', 38],
    ['Technical Skills', 38], ['LinkedIn', 30], ['GitHub', 30], ['Portfolio', 30],
    ['ATS Score', 12], ['AI Score', 12], ['Resume Filename', 28], ['Created', 16], ['Updated', 16],
  ] as const;
  details.columns = columns.map(([, width]) => ({ width }));
  details.mergeCells(1, 1, 1, columns.length);
  details.getCell(1, 1).value = `${job.title} — Uploaded Resume Details`;
  styleTitle(details.getRow(1), brand);
  details.getRow(3).values = columns.map(([label]) => label);
  styleHeader(details.getRow(3), brand);
  details.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };

  rows.forEach((candidate, index) => {
    const row = details.addRow([
      index + 1,
      candidate.id,
      candidate.name,
      candidate.email || '',
      candidate.phone || '',
      job.title,
      job.client || '',
      titleCase(candidate.effective_status),
      candidate.hiring_manager_name || 'Unassigned Hiring Manager',
      candidate.recruiter_name || 'Unassigned Recruiter',
      candidate.experience_years ?? '',
      candidate.current_company || '',
      candidate.current_location || '',
      candidate.preferred_location || '',
      candidate.notice_period || '',
      candidate.current_salary || '',
      candidate.salary_expectation || '',
      candidate.highest_qualification || '',
      list(candidate.skills),
      list(candidate.technical_skills),
      candidate.linkedin || '',
      candidate.github || '',
      candidate.portfolio || '',
      candidate.ats_score ?? '',
      candidate.ai_score ?? '',
      candidate.resume_filename || '',
      dateValue(candidate.created_at),
      dateValue(candidate.updated_at),
    ]);
    row.getCell(27).numFmt = 'dd-mmm-yyyy';
    row.getCell(28).numFmt = 'dd-mmm-yyyy';
    styleBodyRow(row, index);
  });

  details.getColumn(24).numFmt = '0.0';
  details.getColumn(25).numFmt = '0.0';
  details.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function resumeWorkbookFilename(jobTitle: string, now = new Date()): string {
  const slug = jobTitle
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'job';
  const date = now.toISOString().slice(0, 10);
  return `${slug}-resumes-${date}.xlsx`;
}
