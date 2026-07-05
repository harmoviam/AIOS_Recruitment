/** Base domain for tenant subdomains in production (e.g. staffpro-agency.aios.app). */
export const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN || 'aios.app';

export const PLATFORM_LOGIN_PATH = '/platform/login';

export function tenantLoginPath(slug: string): string {
  return `/login/${slug}`;
}

export function tenantForgotPasswordPath(slug: string): string {
  return `/login/${slug}/forgot-password`;
}

/** Path-based login URL — reliable on localhost. */
export function tenantLoginUrl(slug: string): string {
  if (typeof window === 'undefined') return tenantLoginPath(slug);
  return `${window.location.origin}${tenantLoginPath(slug)}`;
}

/** Subdomain login URL — production-style (staffpro-agency.aios.app/login). */
export function tenantSubdomainLoginUrl(slug: string): string {
  if (typeof window === 'undefined') return `https://${slug}.${APP_DOMAIN}/login`;
  const protocol = window.location.protocol;
  const port = window.location.port ? `:${window.location.port}` : '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${protocol}//${slug}.localhost${port}/login`;
  }
  return `${protocol}//${slug}.${APP_DOMAIN}/login`;
}

export function platformLoginUrl(): string {
  if (typeof window === 'undefined') return PLATFORM_LOGIN_PATH;
  return `${window.location.origin}${PLATFORM_LOGIN_PATH}`;
}

/** Parse tenant slug from hostname (e.g. staffpro-agency.localhost or earlyjobs.aios.app). */
export function getTenantSlugFromHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): string | null {
  const h = hostname.toLowerCase();
  if (!h || h === 'localhost' || h === '127.0.0.1') return null;

  const parts = h.split('.');
  if (parts.length < 2) return null;

  const sub = parts[0];
  if (!sub || sub === 'www') return null;
  if (sub === 'platform') return 'platform';
  return sub;
}

export function loginRedirectPath(storedSlug?: string | null): string {
  if (storedSlug === 'platform') return PLATFORM_LOGIN_PATH;
  if (storedSlug) return tenantLoginPath(storedSlug);
  return '/login';
}

export function isLocalHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1';
}
