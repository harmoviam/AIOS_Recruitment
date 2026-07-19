import type {
  CityCreateInput,
  CityUpdateInput,
  CountryCreateInput,
  CountryUpdateInput,
  StateCreateInput,
  StateUpdateInput,
} from '../../../dto/sourcing/geo.js';
import * as countryRepo from '../../../repositories/sourcing/countryRepository.js';
import * as stateRepo from '../../../repositories/sourcing/stateRepository.js';
import * as cityRepo from '../../../repositories/sourcing/cityRepository.js';
import type { ListQuery } from '../pagination.js';
import { toPageResult, type PageResult } from '../pagination.js';
import type { CityDto, CountryDto, StateDto } from '../../../dto/sourcing/geo.js';

export async function listCountries(tenantId: number, query: ListQuery): Promise<PageResult<CountryDto>> {
  const { items, total } = await countryRepo.listCountries(tenantId, query);
  return toPageResult(items, total, query);
}

export async function getCountry(tenantId: number, id: string) {
  return countryRepo.getCountryById(tenantId, id);
}

export async function createCountry(tenantId: number, input: CountryCreateInput, createdBy: string) {
  return countryRepo.createCountry(tenantId, input, createdBy);
}

export async function updateCountry(tenantId: number, id: string, input: CountryUpdateInput) {
  return countryRepo.updateCountry(tenantId, id, input);
}

export async function listStates(
  tenantId: number,
  query: ListQuery,
  countryId?: string
): Promise<PageResult<StateDto>> {
  if (countryId) {
    const country = await countryRepo.getCountryById(tenantId, countryId);
    if (!country) {
      const err = new Error('COUNTRY_NOT_FOUND') as Error & { code: string };
      err.code = 'COUNTRY_NOT_FOUND';
      throw err;
    }
  }
  const { items, total } = await stateRepo.listStates(tenantId, query, countryId);
  return toPageResult(items, total, query);
}

export async function getState(tenantId: number, id: string) {
  return stateRepo.getStateById(tenantId, id);
}

export async function createState(tenantId: number, input: StateCreateInput, createdBy: string) {
  const country = await countryRepo.getCountryById(tenantId, input.countryId);
  if (!country) {
    const err = new Error('COUNTRY_NOT_FOUND') as Error & { code: string };
    err.code = 'COUNTRY_NOT_FOUND';
    throw err;
  }
  return stateRepo.createState(tenantId, input, createdBy);
}

export async function updateState(tenantId: number, id: string, input: StateUpdateInput) {
  if (input.countryId) {
    const country = await countryRepo.getCountryById(tenantId, input.countryId);
    if (!country) {
      const err = new Error('COUNTRY_NOT_FOUND') as Error & { code: string };
      err.code = 'COUNTRY_NOT_FOUND';
      throw err;
    }
  }
  return stateRepo.updateState(tenantId, id, input);
}

export async function listCities(
  tenantId: number,
  query: ListQuery,
  stateId?: string
): Promise<PageResult<CityDto>> {
  if (stateId) {
    const state = await stateRepo.getStateById(tenantId, stateId);
    if (!state) {
      const err = new Error('STATE_NOT_FOUND') as Error & { code: string };
      err.code = 'STATE_NOT_FOUND';
      throw err;
    }
  }
  const { items, total } = await cityRepo.listCities(tenantId, query, stateId);
  return toPageResult(items, total, query);
}

export async function getCity(tenantId: number, id: string) {
  return cityRepo.getCityById(tenantId, id);
}

export async function createCity(tenantId: number, input: CityCreateInput, createdBy: string) {
  const state = await stateRepo.getStateById(tenantId, input.stateId);
  if (!state) {
    const err = new Error('STATE_NOT_FOUND') as Error & { code: string };
    err.code = 'STATE_NOT_FOUND';
    throw err;
  }
  return cityRepo.createCity(tenantId, input, createdBy);
}

export async function updateCity(tenantId: number, id: string, input: CityUpdateInput) {
  if (input.stateId) {
    const state = await stateRepo.getStateById(tenantId, input.stateId);
    if (!state) {
      const err = new Error('STATE_NOT_FOUND') as Error & { code: string };
      err.code = 'STATE_NOT_FOUND';
      throw err;
    }
  }
  return cityRepo.updateCity(tenantId, id, input);
}
