import { describe, expect, it } from 'vitest';
import { haversineDistanceKm } from '../utils/haversine.js';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceKm(28.6139, 77.209, 28.6139, 77.209)).toBe(0);
  });

  it('computes Delhi to Noida roughly 20 km', () => {
    const km = haversineDistanceKm(28.6139, 77.209, 28.5355, 77.391);
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(25);
  });

  it('rounds to one decimal place', () => {
    const km = haversineDistanceKm(19.076, 72.8777, 19.086, 72.8877);
    expect(String(km).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
