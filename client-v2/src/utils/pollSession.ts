const recruiterKey = (tenantSlug: string) => `aios_poll_recruiter_id:${tenantSlug}`;

export function getPollRecruiterId(tenantSlug: string): number | null {
  if (!tenantSlug) return null;
  const raw = localStorage.getItem(recruiterKey(tenantSlug));
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function setPollRecruiterId(tenantSlug: string, id: number) {
  localStorage.setItem(recruiterKey(tenantSlug), String(id));
}

export function clearPollRecruiterId(tenantSlug: string) {
  localStorage.removeItem(recruiterKey(tenantSlug));
}

export function pollPath(tenantSlug: string, suffix = ''): string {
  const base = `/poll/${encodeURIComponent(tenantSlug)}`;
  return suffix ? `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}` : base;
}
