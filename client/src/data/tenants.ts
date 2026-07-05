import type { Tenant, TenantPlan } from '../types';

export const TENANT_PLANS: Record<TenantPlan, { label: string; recruiters: number; candidates: number }> = {
  starter: { label: 'Starter', recruiters: 3, candidates: 2000 },
  pro: { label: 'Pro', recruiters: 15, candidates: 25000 },
  enterprise: { label: 'Enterprise', recruiters: 999, candidates: 999999 },
};

export const MOCK_TENANTS: Tenant[] = [
  {
    id: 1,
    slug: 'staffpro-agency',
    name: 'StaffPro Agency',
    plan: 'pro',
    status: 'active',
    primaryColor: '#2563EB',
    logoInitials: 'SP',
    usersCount: 24,
    candidatesCount: 12400,
    createdAt: '2024-03-15',
    features: ['whatsapp', 'ai_insights', 'automation', 'reports'],
  },
  {
    id: 2,
    slug: 'talentbridge',
    name: 'TalentBridge Solutions',
    plan: 'enterprise',
    status: 'active',
    primaryColor: '#0D9488',
    logoInitials: 'TB',
    usersCount: 86,
    candidatesCount: 48200,
    createdAt: '2023-11-02',
    features: ['whatsapp', 'ai_insights', 'automation', 'reports', 'ai_calling', 'sso', 'api', 'white_label'],
  },
  {
    id: 3,
    slug: 'quickhire',
    name: 'QuickHire Staffing',
    plan: 'starter',
    status: 'trial',
    primaryColor: '#7C3AED',
    logoInitials: 'QH',
    usersCount: 3,
    candidatesCount: 890,
    createdAt: '2025-06-20',
    trialEndsAt: '2025-07-20',
    features: ['whatsapp', 'ai_insights', 'reports'],
  },
  {
    id: 4,
    slug: 'earlyjobs',
    name: 'EarlyJobs',
    plan: 'pro',
    status: 'active',
    primaryColor: '#EA580C',
    logoInitials: 'EJ',
    usersCount: 3,
    candidatesCount: 0,
    createdAt: '2025-01-10',
    features: ['whatsapp', 'ai_insights', 'automation', 'reports'],
  },
];

export const DEFAULT_TENANT_SLUG = 'staffpro-agency';

export function getTenantBySlug(slug: string): Tenant | undefined {
  return MOCK_TENANTS.find((t) => t.slug === slug);
}

export function tenantHasFeature(tenant: Tenant, feature: string): boolean {
  return tenant.features.includes(feature);
}
