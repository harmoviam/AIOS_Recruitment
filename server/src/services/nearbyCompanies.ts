import { haversineDistanceKm } from '../utils/haversine.js';

export interface CompanyGeoRow {
  id: number;
  name: string;
  industry: string | null;
  location: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  open_jobs?: number;
  hiring_manager?: string | null;
}

export interface NearbyCompanyDto {
  id: number;
  name: string;
  industry: string | null;
  location: string | null;
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  distance_km: number;
  open_jobs: number;
  hiring_manager: string | null;
}

export interface NearbyCompaniesResult {
  companies: NearbyCompanyDto[];
  origin: { latitude: number; longitude: number };
  max_distance_km: number;
  message?: string;
}

const DEFAULT_MAX_DISTANCE_KM = 50;

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rank active geo-tagged companies by distance from an origin point. */
export function findNearbyCompanies(
  originLat: number,
  originLng: number,
  companies: CompanyGeoRow[],
  maxDistanceKm: number = DEFAULT_MAX_DISTANCE_KM
): NearbyCompanyDto[] {
  const results: NearbyCompanyDto[] = [];

  for (const co of companies) {
    const lat = toNum(co.latitude);
    const lng = toNum(co.longitude);
    if (lat == null || lng == null) continue;
    if (co.status && co.status !== 'active') continue;

    const distance_km = haversineDistanceKm(originLat, originLng, lat, lng);
    if (distance_km > maxDistanceKm) continue;

    results.push({
      id: co.id,
      name: co.name,
      industry: co.industry ?? null,
      location: co.location ?? null,
      status: co.status,
      latitude: lat,
      longitude: lng,
      address: co.address ?? null,
      city: co.city ?? null,
      state: co.state ?? null,
      country: co.country ?? null,
      pincode: co.pincode ?? null,
      distance_km,
      open_jobs: co.open_jobs ?? 0,
      hiring_manager: co.hiring_manager ?? null,
    });
  }

  results.sort((a, b) => a.distance_km - b.distance_km || a.name.localeCompare(b.name));
  return results;
}

export function parseMaxDistanceKm(raw: unknown): number {
  if (raw == null || raw === '' || raw === 'all') return DEFAULT_MAX_DISTANCE_KM;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_DISTANCE_KM;
  return Math.min(n, 500);
}

export { DEFAULT_MAX_DISTANCE_KM };
