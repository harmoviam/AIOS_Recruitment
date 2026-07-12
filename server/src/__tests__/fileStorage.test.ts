import { describe, expect, it } from 'vitest';
import { ALLOWED_MIME_TYPES, isAllowedMimeType, RESUME_MAX_BYTES } from '../services/fileStorage.js';

describe('fileStorage', () => {
  it('allows PDF, DOC, and DOCX mime types', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(true);
    expect(isAllowedMimeType('application/msword')).toBe(true);
    expect(isAllowedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(isAllowedMimeType('text/plain')).toBe(false);
  });

  it('maps mime types to extensions', () => {
    expect(ALLOWED_MIME_TYPES['application/pdf']).toBe('.pdf');
    expect(ALLOWED_MIME_TYPES['application/msword']).toBe('.doc');
  });

  it('defaults max upload to 10MB', () => {
    expect(RESUME_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
