const recruiterKey = (tenantSlug: string, pollSlug: string) =>
  `aios_poll_recruiter_id:${tenantSlug}:${pollSlug}`;

export function getPollRecruiterId(tenantSlug: string, pollSlug: string): number | null {
  if (!tenantSlug || !pollSlug) return null;
  const raw = localStorage.getItem(recruiterKey(tenantSlug, pollSlug));
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function setPollRecruiterId(tenantSlug: string, pollSlug: string, id: number) {
  localStorage.setItem(recruiterKey(tenantSlug, pollSlug), String(id));
}

export function clearPollRecruiterId(tenantSlug: string, pollSlug: string) {
  localStorage.removeItem(recruiterKey(tenantSlug, pollSlug));
}

/** Build public poll paths: /poll/{tenant}, /poll/{tenant}/{pollSlug}, or with a suffix. */
export function pollPath(tenantSlug: string, pollSlug?: string, suffix = ''): string {
  let base = `/poll/${encodeURIComponent(tenantSlug)}`;
  if (pollSlug) {
    base += `/${encodeURIComponent(pollSlug)}`;
  }
  if (!suffix) return base;
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}
