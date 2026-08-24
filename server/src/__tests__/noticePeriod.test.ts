import { describe, expect, it } from 'vitest';
import { NOTICE_PERIOD_OPTIONS, normalizeNoticePeriod } from '../services/noticePeriod.js';

describe('notice period', () => {
  it('defines the supported candidate options', () => {
    expect(NOTICE_PERIOD_OPTIONS).toEqual([
      'Immediate',
      'Within 15 Days',
      'Within 30 Days',
      'Within 45 Days',
      'Within 60 Days',
      'Within 90 Days',
    ]);
  });

  it('normalizes resume-parser variants', () => {
    expect(normalizeNoticePeriod('immediate')).toBe('Immediate');
    expect(normalizeNoticePeriod('30 days')).toBe('Within 30 Days');
    expect(normalizeNoticePeriod('Within 45 days')).toBe('Within 45 Days');
    expect(normalizeNoticePeriod('two months')).toBeNull();
    expect(normalizeNoticePeriod('')).toBeNull();
  });
});

