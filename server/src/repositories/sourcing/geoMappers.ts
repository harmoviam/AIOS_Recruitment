import type { CityDto, CountryDto, StateDto } from '../../dto/sourcing/geo.js';

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

export function mapCountry(row: Record<string, unknown>): CountryDto {
  return {
    id: String(row.id),
    tenantId: Number(row.tenant_id),
    code: String(row.code),
    name: String(row.name),
    phoneCode: row.phone_code != null ? String(row.phone_code) : null,
    createdDate: new Date(String(row.created_date)).toISOString(),
    modifiedDate: new Date(String(row.modified_date)).toISOString(),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    status: String(row.status),
    version: Number(row.version),
  };
}

export function mapState(row: Record<string, unknown>): StateDto {
  return {
    id: String(row.id),
    tenantId: Number(row.tenant_id),
    countryId: String(row.country_id),
    code: String(row.code),
    name: String(row.name),
    createdDate: new Date(String(row.created_date)).toISOString(),
    modifiedDate: new Date(String(row.modified_date)).toISOString(),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    status: String(row.status),
    version: Number(row.version),
  };
}

export function mapCity(row: Record<string, unknown>): CityDto {
  const langs = row.language_availability;
  return {
    id: String(row.id),
    tenantId: Number(row.tenant_id),
    stateId: String(row.state_id),
    name: String(row.name),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    population: int(row.population),
    freshersAvailability: int(row.freshers_availability),
    engineeringColleges: int(row.engineering_colleges),
    degreeColleges: int(row.degree_colleges),
    mbaColleges: int(row.mba_colleges),
    trainingInstitutes: int(row.training_institutes),
    spokenEnglishInstitutes: int(row.spoken_english_institutes),
    bpoCompanies: int(row.bpo_companies),
    itCompanies: int(row.it_companies),
    averageSalary: num(row.average_salary),
    languageAvailability: Array.isArray(langs) ? langs.map(String) : [],
    nightShiftAcceptance: int(row.night_shift_acceptance),
    womenWorkforcePct: num(row.women_workforce_pct),
    migrationPct: num(row.migration_pct),
    publicTransportScore: int(row.public_transport_score),
    costOfLivingIndex: num(row.cost_of_living_index),
    hiringDifficulty: int(row.hiring_difficulty),
    createdDate: new Date(String(row.created_date)).toISOString(),
    modifiedDate: new Date(String(row.modified_date)).toISOString(),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    status: String(row.status),
    version: Number(row.version),
  };
}
