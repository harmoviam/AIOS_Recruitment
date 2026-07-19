import { pool } from '../../db.js';
import type { CityCreateInput, CityDto, CityUpdateInput } from '../../dto/sourcing/geo.js';
import type { ListQuery } from '../../services/sourcing/pagination.js';
import { toOffsetLimit } from '../../services/sourcing/pagination.js';
import { VersionConflictError } from './countryRepository.js';
import { mapCity } from './geoMappers.js';

const SORT_MAP: Record<string, string> = {
  name: 'name',
  createdDate: 'created_date',
  modifiedDate: 'modified_date',
  population: 'population',
};

const CITY_FIELDS: Array<{ key: keyof CityCreateInput; column: string }> = [
  { key: 'stateId', column: 'state_id' },
  { key: 'name', column: 'name' },
  { key: 'latitude', column: 'latitude' },
  { key: 'longitude', column: 'longitude' },
  { key: 'population', column: 'population' },
  { key: 'freshersAvailability', column: 'freshers_availability' },
  { key: 'engineeringColleges', column: 'engineering_colleges' },
  { key: 'degreeColleges', column: 'degree_colleges' },
  { key: 'mbaColleges', column: 'mba_colleges' },
  { key: 'trainingInstitutes', column: 'training_institutes' },
  { key: 'spokenEnglishInstitutes', column: 'spoken_english_institutes' },
  { key: 'bpoCompanies', column: 'bpo_companies' },
  { key: 'itCompanies', column: 'it_companies' },
  { key: 'averageSalary', column: 'average_salary' },
  { key: 'nightShiftAcceptance', column: 'night_shift_acceptance' },
  { key: 'womenWorkforcePct', column: 'women_workforce_pct' },
  { key: 'migrationPct', column: 'migration_pct' },
  { key: 'publicTransportScore', column: 'public_transport_score' },
  { key: 'costOfLivingIndex', column: 'cost_of_living_index' },
  { key: 'hiringDifficulty', column: 'hiring_difficulty' },
  { key: 'status', column: 'status' },
];

export async function listCities(
  tenantId: number,
  query: ListQuery,
  stateId?: string
): Promise<{ items: CityDto[]; total: number }> {
  const { offset, limit } = toOffsetLimit(query);
  const sortCol = SORT_MAP[query.sort || 'name'] || 'name';
  const params: unknown[] = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (stateId) {
    params.push(stateId);
    where += ` AND state_id = $${params.length}`;
  }
  if (query.status) {
    params.push(query.status);
    where += ` AND status = $${params.length}`;
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    where += ` AND name ILIKE $${params.length}`;
  }

  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM sourcing_city ${where}`, params);
  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_city ${where}
     ORDER BY ${sortCol} ASC NULLS LAST
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { items: rows.map(mapCity), total: countRes.rows[0].c };
}

export async function getCityById(tenantId: number, id: string): Promise<CityDto | null> {
  const { rows } = await pool.query(
    `SELECT * FROM sourcing_city WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rows[0] ? mapCity(rows[0]) : null;
}

export async function createCity(
  tenantId: number,
  input: CityCreateInput,
  createdBy: string
): Promise<CityDto> {
  const { rows } = await pool.query(
    `INSERT INTO sourcing_city (
       tenant_id, state_id, name, latitude, longitude, population,
       freshers_availability, engineering_colleges, degree_colleges, mba_colleges,
       training_institutes, spoken_english_institutes, bpo_companies, it_companies,
       average_salary, language_availability, night_shift_acceptance, women_workforce_pct,
       migration_pct, public_transport_score, cost_of_living_index, hiring_difficulty,
       status, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,
       $7,$8,$9,$10,
       $11,$12,$13,$14,
       $15,$16::jsonb,$17,$18,
       $19,$20,$21,$22,
       $23,$24
     ) RETURNING *`,
    [
      tenantId,
      input.stateId,
      input.name,
      input.latitude ?? null,
      input.longitude ?? null,
      input.population ?? null,
      input.freshersAvailability ?? null,
      input.engineeringColleges ?? null,
      input.degreeColleges ?? null,
      input.mbaColleges ?? null,
      input.trainingInstitutes ?? null,
      input.spokenEnglishInstitutes ?? null,
      input.bpoCompanies ?? null,
      input.itCompanies ?? null,
      input.averageSalary ?? null,
      JSON.stringify(input.languageAvailability ?? []),
      input.nightShiftAcceptance ?? null,
      input.womenWorkforcePct ?? null,
      input.migrationPct ?? null,
      input.publicTransportScore ?? null,
      input.costOfLivingIndex ?? null,
      input.hiringDifficulty ?? null,
      input.status ?? 'ACTIVE',
      createdBy,
    ]
  );
  return mapCity(rows[0]);
}

export async function updateCity(
  tenantId: number,
  id: string,
  input: CityUpdateInput
): Promise<CityDto | null> {
  const existing = await getCityById(tenantId, id);
  if (!existing) return null;
  if (input.version !== undefined && input.version !== existing.version) {
    throw new VersionConflictError();
  }

  const sets: string[] = ['modified_date = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, id];

  for (const field of CITY_FIELDS) {
    if (input[field.key] !== undefined) {
      params.push(input[field.key]);
      sets.push(`${field.column} = $${params.length}`);
    }
  }
  if (input.languageAvailability !== undefined) {
    params.push(JSON.stringify(input.languageAvailability));
    sets.push(`language_availability = $${params.length}::jsonb`);
  }

  const { rows } = await pool.query(
    `UPDATE sourcing_city SET ${sets.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    params
  );
  return rows[0] ? mapCity(rows[0]) : null;
}
