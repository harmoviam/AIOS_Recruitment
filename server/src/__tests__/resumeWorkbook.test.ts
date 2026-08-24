import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildResumeWorkbook, resumeWorkbookFilename } from '../services/resumeWorkbook.js';

describe('resume workbook', () => {
  it('creates formatted summary and detail sheets', async () => {
    const buffer = await buildResumeWorkbook({
      tenantName: 'Example Org',
      brandColor: '#0F766E',
      job: { id: 9, title: 'Senior Support Engineer', client: 'Acme', location: 'Pune' },
      rows: [{
        id: 42,
        name: 'Alice Applicant',
        email: 'alice@example.com',
        phone: '9999999999',
        effective_status: 'offer_rejected',
        hiring_manager_name: 'Harsha Manager',
        recruiter_name: 'Rita Recruiter',
        experience_years: 4,
        current_company: 'Current Co',
        current_location: 'Pune',
        preferred_location: 'Mumbai',
        notice_period: '30 days',
        current_salary: '8 LPA',
        salary_expectation: '10 LPA',
        highest_qualification: 'B.Tech',
        skills: ['Support', 'Linux'],
        technical_skills: ['SQL'],
        linkedin: 'https://linkedin.com/in/alice',
        github: null,
        portfolio: null,
        ats_score: 88,
        ai_score: 8.7,
        resume_filename: 'alice.pdf',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
      }],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resume Summary', 'Resume Details']);

    const summary = workbook.getWorksheet('Resume Summary')!;
    expect(summary.getCell('A1').value).toContain('Example Org');
    expect(summary.getCell('B5').value).toBe(1);
    expect(summary.getCell('A1').fill).toMatchObject({ fgColor: { argb: 'FF0F766E' } });

    const details = workbook.getWorksheet('Resume Details')!;
    expect(details.getRow(3).values).toContain('Candidate Name');
    expect(details.getRow(4).values).toContain('Alice Applicant');
    expect(details.getRow(4).values).toContain('Offer Rejected');
    expect(details.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
    expect(details.autoFilter).toBeTruthy();
  });

  it('sanitizes the generated filename', () => {
    expect(resumeWorkbookFilename('Senior Support / Engineer', new Date('2026-08-23T10:00:00Z')))
      .toBe('senior-support-engineer-resumes-2026-08-23.xlsx');
  });
});
