import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { DEFAULT_TENANT_SLUG, MOCK_TENANTS, getTenantBySlug, tenantHasFeature } from '../data/tenants';
import type { Tenant } from '../types';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'aios_tenant_slug';

interface TenantContextValue {
  tenant: Tenant;
  tenants: Tenant[];
  switchTenant: (slug: string) => void;
  can: (feature: string) => boolean;
  isPlatformAdmin: boolean;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

function mapApiTenant(t: Record<string, unknown>): Tenant {
  return {
    id: t.id as number,
    slug: t.slug as string,
    name: t.name as string,
    plan: t.plan as Tenant['plan'],
    status: t.status as Tenant['status'],
    primaryColor: (t.primaryColor as string) || (t.primary_color as string) || '#2563EB',
    logoInitials: (t.logoInitials as string) || (t.logo_initials as string) || 'AI',
    usersCount: (t.usersCount as number) || 0,
    candidatesCount: (t.candidatesCount as number) || 0,
    createdAt: (t.createdAt as string) || '',
    features: (t.features as string[]) || [],
  };
}

function resolveInitialSlug(): string {
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage) return fromStorage;
  return DEFAULT_TENANT_SLUG;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [slug, setSlug] = useState(resolveInitialSlug);
  const [tenant, setTenant] = useState<Tenant>(() => getTenantBySlug(slug) ?? MOCK_TENANTS[0]);
  const [tenants, setTenants] = useState<Tenant[]>(MOCK_TENANTS);
  const [loading, setLoading] = useState(true);

  const isPlatformAdmin = user?.role === 'super_admin';

  const applyTheme = useCallback((primary: string) => {
    document.documentElement.style.setProperty('--tenant-primary', primary);
    document.documentElement.style.setProperty('--primary', primary);
  }, []);

  const loadTenant = useCallback(async () => {
    setLoading(true);
    try {
      if (isPlatformAdmin) {
        const list = await api.getPlatformTenants();
        const mapped = list.map((t) => mapApiTenant(t as unknown as Record<string, unknown>));
        setTenants(mapped.length ? mapped : MOCK_TENANTS);
        const current = mapped.find((t) => t.slug === slug) ?? mapped[0];
        if (current) {
          setTenant(current);
          applyTheme(current.primaryColor);
        }
      } else {
        const current = await api.getCurrentTenant();
        const mapped = mapApiTenant(current as unknown as Record<string, unknown>);
        setTenant(mapped);
        setTenants([mapped]);
        setSlug(mapped.slug);
        localStorage.setItem(STORAGE_KEY, mapped.slug);
        applyTheme(mapped.primaryColor);
      }
    } catch {
      const fallback = getTenantBySlug(slug) ?? MOCK_TENANTS[0];
      setTenant(fallback);
      applyTheme(fallback.primaryColor);
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, slug, applyTheme]);

  useEffect(() => {
    if (user) loadTenant();
  }, [user, loadTenant]);

  const switchTenant = useCallback(
    (nextSlug: string) => {
      if (!isPlatformAdmin && user?.tenant_slug && user.tenant_slug !== nextSlug) return;
      setSlug(nextSlug);
      localStorage.setItem(STORAGE_KEY, nextSlug);
      const found = tenants.find((t) => t.slug === nextSlug) ?? getTenantBySlug(nextSlug);
      if (found) {
        setTenant(found);
        applyTheme(found.primaryColor);
      }
    },
    [isPlatformAdmin, user?.tenant_slug, tenants, applyTheme]
  );

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      tenants: isPlatformAdmin ? tenants : tenants.filter((t) => t.slug === tenant.slug),
      switchTenant,
      can: (feature) => tenantHasFeature(tenant, feature),
      isPlatformAdmin,
      loading,
    }),
    [tenant, tenants, switchTenant, isPlatformAdmin, loading]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
