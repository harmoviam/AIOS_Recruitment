import { z } from 'zod';
import { sourcingStatusSchema } from './geo.js';

export const codeNameCreateSchema = z.object({
  code: z.string().trim().min(1).max(60).transform((v) => v.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  status: sourcingStatusSchema.optional(),
});

export const codeNameUpdateSchema = codeNameCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const roleCreateSchema = codeNameCreateSchema.extend({
  industryId: z.string().uuid().optional().nullable(),
  recruitmentCategoryId: z.string().uuid().optional().nullable(),
  aliases: z.array(z.string()).optional(),
});

export const roleUpdateSchema = roleCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const experienceCreateSchema = z.object({
  code: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(2).max(120),
  minYears: z.number().min(0).optional().nullable(),
  maxYears: z.number().min(0).optional().nullable(),
  rankOrder: z.number().int().optional(),
  status: sourcingStatusSchema.optional(),
});

export const experienceUpdateSchema = experienceCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const qualificationCreateSchema = z.object({
  code: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(2).max(120),
  rankOrder: z.number().int().optional(),
  status: sourcingStatusSchema.optional(),
});

export const qualificationUpdateSchema = qualificationCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const salaryRangeCreateSchema = z.object({
  code: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(2).max(120),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().nonnegative(),
  currency: z.string().trim().length(3).default('INR'),
  status: sourcingStatusSchema.optional(),
}).refine((v) => v.minAmount <= v.maxAmount, { message: 'minAmount must be <= maxAmount' });

export const salaryRangeUpdateSchema = z.object({
  code: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase().replace(/\s+/g, '_')).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  status: sourcingStatusSchema.optional(),
  version: z.number().int().min(0).optional(),
});

export const CHANNEL_TYPES = [
  'FACEBOOK', 'WHATSAPP', 'TELEGRAM', 'LINKEDIN', 'INSTAGRAM',
  'COLLEGE', 'TRAINING_INSTITUTE', 'REFERRAL', 'JOB_PORTAL', 'OTHER',
] as const;

export const sourceCreateSchema = z.object({
  sourceCategoryId: z.string().uuid(),
  cityId: z.string().uuid().optional().nullable(),
  stateId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(200),
  channelType: z.enum(CHANNEL_TYPES),
  locationText: z.string().trim().max(255).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  website: z.string().trim().max(500).optional().nullable(),
  contactPerson: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
  memberCount: z.number().int().nonnegative().optional().nullable(),
  dailyActiveMembers: z.number().int().nonnegative().optional().nullable(),
  postingRules: z.string().optional().nullable(),
  lastVerified: z.string().date().optional().nullable(),
  qualityRating: z.number().min(0).max(10).optional().nullable(),
  responseRate: z.number().min(0).max(100).optional().nullable(),
  estimatedCandidatePool: z.number().int().nonnegative().optional().nullable(),
  roleIds: z.array(z.string().uuid()).optional(),
  industryIds: z.array(z.string().uuid()).optional(),
  experienceLevelIds: z.array(z.string().uuid()).optional(),
  languages: z.array(z.object({
    code: z.string().trim().min(2).max(20),
    name: z.string().trim().min(2).max(80),
  })).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).optional(),
  status: sourcingStatusSchema.optional(),
});

export const sourceUpdateSchema = sourceCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const campaignCreateSchema = z.object({
  roleId: z.string().uuid(),
  cityId: z.string().uuid(),
  experienceLevelId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(200),
  hiringCount: z.number().int().positive(),
  joiningTimelineDays: z.number().int().positive().optional().nullable(),
  salaryMin: z.number().nonnegative().optional().nullable(),
  salaryMax: z.number().nonnegative().optional().nullable(),
  shiftType: z.string().trim().max(40).optional().nullable(),
  genderPreference: z.string().trim().max(20).optional().nullable(),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
  notes: z.string().optional().nullable(),
  sourceIds: z.array(z.object({
    sourceId: z.string().uuid(),
    priority: z.number().int().positive().optional(),
    allocatedTarget: z.number().int().nonnegative().optional().nullable(),
  })).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'COMPLETED']).optional(),
});

export const campaignUpdateSchema = campaignCreateSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

export const campaignSourceAttachSchema = z.object({
  sourceId: z.string().uuid(),
  priority: z.number().int().positive().optional(),
  allocatedTarget: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
});
