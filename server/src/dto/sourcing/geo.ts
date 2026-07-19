import { z } from 'zod';

export const sourcingStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const countryCreateSchema = z.object({
  code: z.string().trim().min(2).max(10).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  phoneCode: z.string().trim().max(10).optional().nullable(),
  status: sourcingStatusSchema.optional(),
});

export const countryUpdateSchema = countryCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const stateCreateSchema = z.object({
  countryId: z.string().uuid(),
  code: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  status: sourcingStatusSchema.optional(),
});

export const stateUpdateSchema = stateCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const cityCreateSchema = z.object({
  stateId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  population: z.number().int().nonnegative().optional().nullable(),
  freshersAvailability: z.number().int().min(0).max(100).optional().nullable(),
  engineeringColleges: z.number().int().nonnegative().optional().nullable(),
  degreeColleges: z.number().int().nonnegative().optional().nullable(),
  mbaColleges: z.number().int().nonnegative().optional().nullable(),
  trainingInstitutes: z.number().int().nonnegative().optional().nullable(),
  spokenEnglishInstitutes: z.number().int().nonnegative().optional().nullable(),
  bpoCompanies: z.number().int().nonnegative().optional().nullable(),
  itCompanies: z.number().int().nonnegative().optional().nullable(),
  averageSalary: z.number().nonnegative().optional().nullable(),
  languageAvailability: z.array(z.string()).optional(),
  nightShiftAcceptance: z.number().int().min(0).max(100).optional().nullable(),
  womenWorkforcePct: z.number().min(0).max(100).optional().nullable(),
  migrationPct: z.number().min(0).max(100).optional().nullable(),
  publicTransportScore: z.number().int().min(0).max(100).optional().nullable(),
  costOfLivingIndex: z.number().nonnegative().optional().nullable(),
  hiringDifficulty: z.number().int().min(0).max(100).optional().nullable(),
  status: sourcingStatusSchema.optional(),
});

export const cityUpdateSchema = cityCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const statusPatchSchema = z.object({
  status: sourcingStatusSchema,
  version: z.number().int().min(0).optional(),
});

export type CountryCreateInput = z.infer<typeof countryCreateSchema>;
export type CountryUpdateInput = z.infer<typeof countryUpdateSchema>;
export type StateCreateInput = z.infer<typeof stateCreateSchema>;
export type StateUpdateInput = z.infer<typeof stateUpdateSchema>;
export type CityCreateInput = z.infer<typeof cityCreateSchema>;
export type CityUpdateInput = z.infer<typeof cityUpdateSchema>;

export interface CountryDto {
  id: string;
  tenantId: number;
  code: string;
  name: string;
  phoneCode: string | null;
  createdDate: string;
  modifiedDate: string;
  createdBy: string | null;
  status: string;
  version: number;
}

export interface StateDto {
  id: string;
  tenantId: number;
  countryId: string;
  code: string;
  name: string;
  createdDate: string;
  modifiedDate: string;
  createdBy: string | null;
  status: string;
  version: number;
}

export interface CityDto {
  id: string;
  tenantId: number;
  stateId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  freshersAvailability: number | null;
  engineeringColleges: number | null;
  degreeColleges: number | null;
  mbaColleges: number | null;
  trainingInstitutes: number | null;
  spokenEnglishInstitutes: number | null;
  bpoCompanies: number | null;
  itCompanies: number | null;
  averageSalary: number | null;
  languageAvailability: string[];
  nightShiftAcceptance: number | null;
  womenWorkforcePct: number | null;
  migrationPct: number | null;
  publicTransportScore: number | null;
  costOfLivingIndex: number | null;
  hiringDifficulty: number | null;
  createdDate: string;
  modifiedDate: string;
  createdBy: string | null;
  status: string;
  version: number;
}
