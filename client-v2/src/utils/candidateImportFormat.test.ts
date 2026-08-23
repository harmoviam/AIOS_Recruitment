import { describe, expect, it } from 'vitest';
import { parseCandidateImportCsv, parseCsvRecords } from './candidateImportFormat';

describe('parseCsvRecords', () => {
  it('handles BOM, CRLF, quoted commas, escaped quotes, and quoted newlines', () => {
    const records = parseCsvRecords(
      '\uFEFFFilename,Name,Summary\r\n' +
      '"alice.pdf","Alice ""AJ""","Line one\r\nLine two, with comma"\r\n'
    );

    expect(records).toEqual([
      ['Filename', 'Name', 'Summary'],
      ['alice.pdf', 'Alice "AJ"', 'Line one\r\nLine two, with comma'],
    ]);
  });

  it('keeps the existing generic candidate import mapping', () => {
    const parsed = parseCandidateImportCsv('Name,Phone,Notes\nAlice,9999999999,"Hello, world"');
    expect(parsed.format).toBe('generic');
    expect(parsed.rows).toEqual([{ Name: 'Alice', Phone: '9999999999', Notes: 'Hello, world' }]);
  });
});
