const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getTenantSlug() {
  return localStorage.getItem('aios_tenant_slug');
}

function parseApiError(res: Response, data: Record<string, unknown>, text: string): string {
  if (data.error && typeof data.error === 'string') return data.error;
  if (res.status === 401) return 'Session expired — please sign in again and retry.';
  if (res.status === 403) return 'You do not have permission to perform this action.';
  if (res.status === 502 || res.status === 503) return 'Server temporarily unavailable — please try again in a moment.';
  if (res.status === 504) return 'Request timed out — please try again.';
  if (!res.ok) return `Request failed (${res.status})`;
  if (text && !text.startsWith('{')) return `Unexpected server response (${res.status})`;
  return 'Request failed';
}

function networkErrorMessage(): string {
  return import.meta.env.PROD
    ? 'Network error — check your connection and try again.'
    : 'API server unavailable — run npm run dev from the project root';
}

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new Error(networkErrorMessage());
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) throw new Error(parseApiError(res, data, text));
  }
  if (!res.ok) throw new Error(parseApiError(res, data, text));
  return data as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantSlug = getTenantSlug();
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new Error(networkErrorMessage());
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) throw new Error(parseApiError(res, data, text));
  }
  if (!res.ok) throw new Error(parseApiError(res, data, text));
  return data as T;
}

async function download(path: string, filename: string) {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantSlug = getTenantSlug();
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function uploadRequest<T>(path: string, formData: FormData, method = 'POST'): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantSlug = getTenantSlug();
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: formData });
  } catch {
    throw new Error(networkErrorMessage());
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) throw new Error(parseApiError(res, data, text));
  }
  if (!res.ok) throw new Error(parseApiError(res, data, text));
  return data as T;
}

export const api = {
  login: (email: string, password: string, workspace?: string) =>
    request<{ token: string; user: import('../types').User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, workspace }),
    }),
  register: (email: string, password: string, name: string, orgName?: string, workspace?: string) =>
    request<{ token: string; user: import('../types').User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, orgName, workspace }),
    }),
  me: () => request<import('../types').User & { phone?: string; timezone?: string }>('/auth/me'),
  updateProfile: (data: { name?: string; phone?: string; timezone?: string; password?: string }) =>
    request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  forgotPassword: (email: string, workspace?: string) =>
    request<{ message: string; resetUrl?: string; token?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, workspace }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  getCurrentTenant: () => request<import('../types').Tenant>('/tenant/current'),
  getWorkspaces: () =>
    request<{ slug: string; name: string; logoInitials: string; primaryColor: string; status: string }[]>(
      '/tenant/workspaces'
    ),
  getTenantBySlug: (slug: string) =>
    request<{ slug: string; name: string; logoInitials: string; primaryColor: string }>(`/tenant/by-slug/${slug}`),
  getPlatformTenants: () => request<import('../types').Tenant[]>('/platform/tenants'),

  getCandidates: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').Candidate[]>(`/candidates${q}`);
  },
  getCandidate: (id: number) => request<import('../types').Candidate>(`/candidates/${id}`),
  getCandidateTimeline: (id: number) =>
    request<import('../types').TimelineEvent[]>(`/candidates/${id}/timeline`),
  createCandidate: (data: Partial<import('../types').Candidate>) =>
    request<import('../types').Candidate>('/candidates', { method: 'POST', body: JSON.stringify(data) }),
  updateCandidate: (id: number, data: Partial<import('../types').Candidate>) =>
    request<import('../types').Candidate>(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  saveScreening: (id: number, scores: Record<string, number | null>) =>
    request<import('../types').Candidate>(`/candidates/${id}/screening`, {
      method: 'PUT',
      body: JSON.stringify(scores),
    }),
  getCandidateScreeningQuestions: (id: number) =>
    request<{
      job_id: number | null;
      job_title: string | null;
      questions: import('../types').JobScreeningQuestions;
    }>(`/candidates/${id}/screening-questions`),
  deleteCandidate: (id: number) => request<void>(`/candidates/${id}`, { method: 'DELETE' }),
  bulkUpdateCandidates: (ids: number[], data: { stage?: string; offer_status?: string; recruiter_id?: number }) =>
    request<{ updated: number }>('/candidates/bulk', { method: 'PATCH', body: JSON.stringify({ ids, ...data }) }),
  exportCandidates: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return download(`/candidates/export${q}`, 'candidates.csv');
  },
  validateImport: (rows: Record<string, string>[], defaultJobId?: number) =>
    request<import('../types').ImportValidation>('/candidates/import/validate', {
      method: 'POST',
      body: JSON.stringify({ rows, default_job_id: defaultJobId }),
    }),
  importCandidates: (rows: Record<string, string>[], skip_errors?: boolean, defaultJobId?: number) =>
    request<{ imported: number; skipped: number }>('/candidates/import', {
      method: 'POST',
      body: JSON.stringify({ rows, skip_errors, default_job_id: defaultJobId }),
    }),
  getCandidateSuggestions: (id: number) =>
    request<{ suggestions: string[]; ai_score: number; salary_expectation?: string }>(
      `/candidates/${id}/suggestions`
    ),
  parseResumePreview: (file: File) => {
    const form = new FormData();
    form.append('resume', file);
    return uploadRequest<import('../types').ResumeParseResponse>('/candidates/parse-resume', form);
  },
  reparseResume: (candidateId: number, file?: File) => {
    const form = new FormData();
    if (file) form.append('resume', file);
    return uploadRequest<{
      candidate: import('../types').Candidate;
      parsed_profile: import('../types').ParsedProfile;
      ai_confidence: number;
      source: string;
    }>(`/candidates/${candidateId}/reparse-resume`, form);
  },
  downloadResume: (candidateId: number, filename?: string) =>
    download(`/candidates/${candidateId}/resume/download`, filename || 'resume'),

  getJobs: () => request<import('../types').Job[]>('/jobs'),
  generateJobDescription: (data: { title: string; client?: string; location?: string; open_positions?: number }) =>
    request<{ description: string }>('/jobs/generate-description', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createJob: (data: Partial<import('../types').Job>) =>
    request<import('../types').Job>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id: number, data: Partial<import('../types').Job>) =>
    request<import('../types').Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getJobScreeningQuestions: (id: number) =>
    request<{
      job_id: number;
      job_title: string;
      questions: import('../types').JobScreeningQuestions;
    }>(`/jobs/${id}/screening-questions`),
  generateJobScreeningQuestions: (id: number) =>
    request<{
      job_id: number;
      job_title: string;
      questions: import('../types').JobScreeningQuestions;
    }>(`/jobs/${id}/generate-screening-questions`, { method: 'POST' }),
  deleteJob: (id: number) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
  recommendJobs: (candidateId: number, params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').RecommendJobsResponse>(`/jobs/recommend/${candidateId}${q}`);
  },

  getInterviews: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').Interview[]>(`/interviews${q}`);
  },
  getInterview: (id: number) => request<import('../types').Interview>(`/interviews/${id}`),
  createInterview: (data: Partial<import('../types').Interview>) =>
    request<import('../types').Interview>('/interviews', { method: 'POST', body: JSON.stringify(data) }),
  updateInterview: (id: number, data: Partial<import('../types').Interview>) =>
    request<import('../types').Interview>(`/interviews/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  saveInterviewEvaluation: (id: number, scores: Record<string, number | string | null>) =>
    request<import('../types').Interview>(`/interviews/${id}/evaluation`, {
      method: 'PUT',
      body: JSON.stringify(scores),
    }),
  getInterviewScreeningQuestions: (id: number) =>
    request<{
      job_id: number | null;
      job_title: string | null;
      questions: import('../types').JobScreeningQuestions;
    }>(`/interviews/${id}/screening-questions`),
  getInterviewVideoToken: (id: number) =>
    request<import('../types').InterviewVideoTokenResponse>(`/interviews/${id}/video-token`),
  getInterviewJoinPreview: (joinToken: string) =>
    publicRequest<import('../types').InterviewJoinPreview>(`/interviews/join/${joinToken}`),
  getInterviewGuestToken: (joinToken: string, participantName: string) =>
    publicRequest<Pick<import('../types').InterviewVideoTokenResponse, 'serverUrl' | 'token' | 'roomName' | 'participantName'>>(
      `/interviews/join/${joinToken}/token`,
      {
        method: 'POST',
        body: JSON.stringify({ participantName }),
      }
    ),

  getConversations: () => request<import('../types').Conversation[]>('/messages/conversations'),
  getMessagingIntegrationStatus: () =>
    request<import('../types').MessagingIntegrationStatus>('/messages/status/integration'),
  getMessages: (candidateId: number) =>
    request<import('../types').Message[]>(`/messages/${candidateId}`),
  sendMessage: (candidateId: number, content: string) =>
    request<import('../types').Message & { wa_status?: string; wa_error?: string }>(
      `/messages/${candidateId}`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      }
    ),
  getMessageSuggestions: (candidateId: number) =>
    request<{ suggestions: string[] }>(`/messages/${candidateId}/suggestions`),

  getActivities: () => request<import('../types').Activity[]>('/activities'),
  getNotifications: () =>
    request<{ count: number; items: import('../types').NotificationItem[] }>('/notifications'),
  getAnalytics: () => request<Record<string, unknown>>('/analytics'),

  getFollowUps: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').FollowUp[]>(`/follow-ups${q}`);
  },
  getFollowUpCounts: () => request<Record<string, number>>('/follow-ups/counts'),
  createFollowUp: (data: Partial<import('../types').FollowUp>) =>
    request<import('../types').FollowUp>('/follow-ups', { method: 'POST', body: JSON.stringify(data) }),
  updateFollowUp: (id: number, data: Partial<import('../types').FollowUp> & { completed?: boolean }) =>
    request<import('../types').FollowUp>(`/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  generateFollowUpScript: (id: number) =>
    request<import('../types').FollowUp>(`/follow-ups/${id}/ai-script`, { method: 'POST' }),

  getCompanies: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').Company[]>(`/companies${q}`);
  },
  createCompany: (data: Partial<import('../types').Company>) =>
    request<import('../types').Company>('/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateCompany: (id: number, data: Partial<import('../types').Company>) =>
    request<import('../types').Company>(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getNearbyCompanies: (lat: number, lng: number, params?: Record<string, string>) => {
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), ...params });
    return request<import('../types').NearbyCompaniesResponse>(`/companies/nearby?${q}`);
  },
  getCompaniesNearCandidate: (candidateId: number, params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').NearbyCompaniesResponse>(`/companies/near/${candidateId}${q}`);
  },

  getHiringManagers: () => request<import('../types').HiringManager[]>('/hiring-managers'),
  createHiringManager: (data: { email: string; password: string; name: string; company_id?: number }) =>
    request('/hiring-managers', { method: 'POST', body: JSON.stringify(data) }),
  updateHiringManager: (id: number, data: { name?: string; password?: string; company_id?: number | null }) =>
    request(`/hiring-managers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getRecruiterStats: (params?: { hm_id?: number }) => {
    const q = params?.hm_id ? `?hm_id=${params.hm_id}` : '';
    return request<import('../types').RecruiterStat[]>(`/recruiters/stats${q}`);
  },
  getTeamPerformance: (hmId?: number) => {
    const q = hmId ? `?hm_id=${hmId}` : '';
    return request<import('../types').TeamPerformance>(`/recruiters/team-performance${q}`);
  },
  getMyWorkflow: () => request<import('../types').RecruiterWorkflow>('/recruiters/my-workflow'),
  getOrganizationOverview: () => request<import('../types').OrganizationOverview>('/organization/overview'),
  createRecruiter: (data: { email: string; password: string; name: string; company_id?: number; managed_by_id?: number }) =>
    request('/recruiters', { method: 'POST', body: JSON.stringify(data) }),
  updateRecruiter: (id: number, data: { name?: string; password?: string; company_id?: number | null; managed_by_id?: number | null }) =>
    request(`/recruiters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getHmDashboard: () => request<import('../types').HmDashboard>('/recruiters/dashboard'),

  getReport: (type: string, days?: number) => {
    const q = new URLSearchParams({ type, days: String(days || 30) });
    return request<{ type: string; data: unknown }>(`/reports?${q}`);
  },
  exportReport: (type: string, days?: number) => {
    const q = new URLSearchParams({ type, days: String(days || 30) });
    return download(`/reports/export?${q}`, `${type}-report.csv`);
  },

  getSettings: () => request<Record<string, unknown>>('/settings'),
  updateSetting: (key: string, value: unknown) =>
    request(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) }),
  getUsers: () => request<import('../types').User[]>('/settings/users/list'),
  createUser: (data: { email: string; password: string; name: string; role?: string }) =>
    request('/settings/users/list', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: Partial<{ name: string; role: string; password: string; wa_signature: string }>) =>
    request(`/settings/users/list/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
