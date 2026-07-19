import { describe, expect, it } from 'vitest';
import {
  cityCreateSchema,
  countryCreateSchema,
  stateCreateSchema,
} from '../dto/sourcing/geo.js';
import { canReadSourcing, canWriteSourcing } from '../services/sourcing/access.js';
import { parseListQuery, toOffsetLimit, toPageResult } from '../services/sourcing/pagination.js';

describe('sourcing geo validation', () => {
  it('normalizes country code to uppercase', () => {
    const parsed = countryCreateSchema.parse({ code: 'in', name: 'India', phoneCode: '+91' });
    expect(parsed.code).toBe('IN');
  });

  it('requires state countryId uuid', () => {
    expect(() => stateCreateSchema.parse({ countryId: 'bad', code: 'PB', name: 'Punjab' })).toThrow();
    const ok = stateCreateSchema.parse({
      countryId: '11111111-1111-4111-8111-111111111111',
      code: 'pb',
      name: 'Punjab',
    });
    expect(ok.code).toBe('PB');
  });

  it('accepts city intelligence fields', () => {
    const city = cityCreateSchema.parse({
      stateId: '11111111-1111-4111-8111-111111111111',
      name: 'Mohali',
      bpoCompanies: 120,
      nightShiftAcceptance: 80,
      languageAvailability: ['English', 'Hindi', 'Punjabi'],
    });
    expect(city.name).toBe('Mohali');
    expect(city.languageAvailability).toHaveLength(3);
  });
});

describe('sourcing access', () => {
  it('allows only org admin (and super_admin) for the full copilot module', () => {
    expect(canReadSourcing('recruiter')).toBe(false);
    expect(canWriteSourcing('recruiter')).toBe(false);
    expect(canReadSourcing('hiring_manager')).toBe(false);
    expect(canReadSourcing('admin')).toBe(true);
    expect(canWriteSourcing('admin')).toBe(true);
    expect(canReadSourcing('super_admin')).toBe(true);
  });
});

describe('sourcing pagination', () => {
  it('computes offset from page/pageSize', () => {
    const q = parseListQuery({ page: '2', pageSize: '10', q: 'moh' });
    expect(toOffsetLimit(q)).toEqual({ offset: 10, limit: 10 });
    expect(toPageResult([{ id: 1 }], 25, q).totalPages).toBe(3);
  });
});
