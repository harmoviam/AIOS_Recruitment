/** Static brand marks served from /public/brands for public surfaces (poll, etc.). */
const TENANT_LOGOS: Record<string, string> = {
  earlyjobs: '/brands/earlyjobs-logo.png',
};

export function getTenantLogoUrl(slug?: string | null): string | null {
  if (!slug) return null;
  return TENANT_LOGOS[slug.toLowerCase()] ?? null;
}
