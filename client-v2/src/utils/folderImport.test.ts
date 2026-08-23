import { describe, expect, it } from 'vitest';
import { inspectCandidateImportFolder } from './folderImport';

function folderFile(path: string, contents: string, type = ''): File {
  const name = path.split('/').pop() || path;
  const file = new File([contents], name, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

const CSV_HEADER = 'Filename,Name,Email,Phone,Role,Experience,Education,Skills,Summary';

describe('inspectCandidateImportFolder', () => {
  it('maps CSV rows to matching PDFs and ignores unrelated files', async () => {
    const csv = `${CSV_HEADER}\n` +
      'alice.pdf,Alice,alice@example.com,9999999999,Engineer,4,BTech,"React, Node","Strong, clear communicator"\n' +
      'bob.pdf,Bob,bob@example.com,8888888888,Support,2,BA,Support,Experienced';
    const inspection = await inspectCandidateImportFolder([
      folderFile('candidates/all_resumes_summary.csv', csv, 'text/csv'),
      folderFile('candidates/alice.pdf', '%PDF-alice', 'application/pdf'),
      folderFile('candidates/bob.pdf', '%PDF-bob', 'application/pdf'),
      folderFile('candidates/notes.txt', 'ignore me'),
    ]);

    expect(inspection.folderName).toBe('candidates');
    expect(inspection.totalFiles).toBe(4);
    expect(inspection.totalPdfs).toBe(2);
    expect(inspection.rows.map((row) => row.pdfStatus)).toEqual(['matched', 'matched']);
    expect(inspection.rows[0].candidate.skills).toBe('React, Node');
    expect(inspection.rows[0].candidate.summary).toBe('Strong, clear communicator');
  });

  it('marks missing PDFs as unavailable', async () => {
    const inspection = await inspectCandidateImportFolder([
      folderFile('candidates/all_resumes_summary.csv', `${CSV_HEADER}\nmissing.pdf,Alice,,,,,,,`),
    ]);

    expect(inspection.rows[0].pdfStatus).toBe('missing');
    expect(inspection.rows[0].resume).toBeNull();
  });

  it('marks duplicate basenames in nested folders as ambiguous', async () => {
    const inspection = await inspectCandidateImportFolder([
      folderFile('candidates/all_resumes_summary.csv', `${CSV_HEADER}\nsame.pdf,Alice,,,,,,,`),
      folderFile('candidates/one/same.pdf', '%PDF-one'),
      folderFile('candidates/two/same.pdf', '%PDF-two'),
    ]);

    expect(inspection.rows[0].pdfStatus).toBe('ambiguous');
    expect(inspection.rows[0].resume).toBeNull();
  });

  it('requires the summary CSV at the selected folder root', async () => {
    await expect(inspectCandidateImportFolder([
      folderFile('candidates/nested/all_resumes_summary.csv', `${CSV_HEADER}\na.pdf,Alice,,,,,,,`),
      folderFile('candidates/a.pdf', '%PDF-a'),
    ])).rejects.toThrow('top level');
  });
});
