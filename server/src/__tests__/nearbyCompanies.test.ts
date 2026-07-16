import { describe, expect, it } from 'vitest';
import {
  findNearbyCompanies,
  parseMaxDistanceKm,
  type CompanyGeoRow,
} from '../services/nearbyCompanies.js';

const delhi = { lat: 28.6139, lng: 77.209 };

function company(overrides: Partial<CompanyGeoRow> & { id: number; name: string }): CompanyGeoRow {
  return {
    industry: 'IT',
    location: 'Delhi',
    status: 'active',
    latitude: delhi.lat,
    longitude: delhi.lng,
    open_jobs: 1,
    hiring_manager: null,
    ...overrides,
  };
}

describe('findNearbyCompanies', () => {
  it('ranks companies by ascending distance', () => {
    const companies = [
      company({ id: 1, name: 'Far Co', latitude: 28.4, longitude: 77.1 }),
      company({ id: 2, name: 'Near Co', latitude: 28.62, longitude: 77.21 }),
      company({ id: 3, name: 'Mid Co', latitude: 28.55, longitude: 77.25 }),
    ];

    const result = findNearbyCompanies(delhi.lat, delhi.lng, companies, 50);
    expect(result.map((c) => c.name)).toEqual(['Near Co', 'Mid Co', 'Far Co']);
    expect(result[0].distance_km).toBeLessThan(result[1].distance_km);
    expect(result[1].distance_km).toBeLessThan(result[2].distance_km);
  });

  it('excludes companies without coordinates', () => {
    const companies = [
      company({ id: 1, name: 'Pinned', latitude: 28.62, longitude: 77.21 }),
      company({ id: 2, name: 'No Pin', latitude: null, longitude: null }),
    ];
    const result = findNearbyCompanies(delhi.lat, delhi.lng, companies, 50);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Pinned');
  });

  it('filters by max distance', () => {
    const companies = [
      company({ id: 1, name: 'Close', latitude: 28.62, longitude: 77.21 }),
      // ~1400+ km from Delhi
      company({ id: 2, name: 'Mumbai', latitude: 19.076, longitude: 72.8777 }),
    ];
    const result = findNearbyCompanies(delhi.lat, delhi.lng, companies, 50);
    expect(result.map((c) => c.name)).toEqual(['Close']);
  });

  it('skips inactive companies', () => {
    const companies = [
      company({ id: 1, name: 'Active', status: 'active' }),
      company({ id: 2, name: 'Inactive', status: 'inactive' }),
    ];
    const result = findNearbyCompanies(delhi.lat, delhi.lng, companies, 50);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Active');
  });

  it('includes open_jobs on each result', () => {
    const companies = [company({ id: 1, name: 'Hiring', open_jobs: 4 })];
    const result = findNearbyCompanies(delhi.lat, delhi.lng, companies, 50);
    expect(result[0].open_jobs).toBe(4);
  });
});

describe('parseMaxDistanceKm', () => {
  it('defaults to 50 km', () => {
    expect(parseMaxDistanceKm(undefined)).toBe(50);
    expect(parseMaxDistanceKm('')).toBe(50);
    expect(parseMaxDistanceKm('all')).toBe(50);
  });

  it('parses valid positive numbers and caps at 500', () => {
    expect(parseMaxDistanceKm('20')).toBe(20);
    expect(parseMaxDistanceKm(1000)).toBe(500);
  });
});
