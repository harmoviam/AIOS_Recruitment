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

async function publicUpload<T>(path: string, formData: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { method: 'POST', body: formData });
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
  getCandidatesPaged: (params: Record<string, string>) => {
    const q = '?' + new URLSearchParams(params).toString();
    return request<{
      rows: import('../types').Candidate[];
      total: number;
      limit: number;
      offset: number;
    }>(`/candidates${q}`);
  },
  getCandidate: (id: number) => request<import('../types').Candidate>(`/candidates/${id}`),
  getCandidateTimeline: (id: number) =>
    request<import('../types').TimelineEvent[]>(`/candidates/${id}/timeline`),
  createCandidate: (data: Partial<import('../types').Candidate> & { job_ids?: number[] }) =>
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
  uploadTenantLogo: (file: File) => {
    const form = new FormData();
    form.append('logo', file);
    return uploadRequest<{ logoUrl: string }>('/settings/logo', form);
  },
  deleteTenantLogo: () =>
    request<{ logoUrl: null }>('/settings/logo', { method: 'DELETE' }),
  getUsers: () => request<import('../types').User[]>('/settings/users/list'),
  createUser: (data: { email: string; password: string; name: string; role?: string }) =>
    request('/settings/users/list', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: Partial<{ name: string; role: string; password: string; wa_signature: string }>) =>
    request(`/settings/users/list/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  /* Applications (candidate <-> job many-to-many) */
  getCandidateApplications: (candidateId: number) =>
    request<import('../types').Application[]>(`/applications/candidate/${candidateId}`),
  submitCandidateToJob: (candidateId: number, jobId: number) =>
    request<import('../types').Application>(`/applications/candidate/${candidateId}`, {
      method: 'POST',
      body: JSON.stringify({ job_id: jobId }),
    }),
  updateApplication: (
    id: number,
    data: { stage?: string; offer_status?: string | null; expected_joining_at?: string | null }
  ) =>
    request<import('../types').Application>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  withdrawApplication: (id: number) =>
    request<{ deleted: boolean }>(`/applications/${id}`, { method: 'DELETE' }),
  getJobPipeline: (jobId: number) =>
    request<{ job: { id: number; title: string }; applications: import('../types').JobPipelineApplication[] }>(
      `/jobs/${jobId}/pipeline`
    ),

  /* Billing (Razorpay orders + checkout + verify) */
  getBilling: () => request<import('../types').BillingInfo>('/billing'),
  createBillingOrder: (plan: string, cycle: 'monthly' | 'annual') =>
    request<import('../types').BillingOrder>('/billing/order', {
      method: 'POST',
      body: JSON.stringify({ plan, cycle }),
    }),
  verifyBillingPayment: (data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) =>
    request<{ activated: boolean; plan: string; period_end: string }>('/billing/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateGstin: (gstin: string) =>
    request<{ gstin: string | null }>('/billing/gstin', {
      method: 'PATCH',
      body: JSON.stringify({ gstin }),
    }),

  /* Public careers pages (unauthenticated) */
  careersGetTenant: (slug: string) =>
    publicRequest<{
      slug: string;
      name: string;
      primary_color: string;
      logo_initials: string;
      logo_url: string | null;
    }>(`/public/${encodeURIComponent(slug)}`),
  careersGetJobs: (slug: string) =>
    publicRequest<import('../types').PublicJob[]>(`/public/${encodeURIComponent(slug)}/jobs`),
  careersGetJob: (slug: string, jobId: number) =>
    publicRequest<import('../types').PublicJob>(`/public/${encodeURIComponent(slug)}/jobs/${jobId}`),
  careersApply: (
    slug: string,
    jobId: number,
    data: { name: string; email: string; phone: string; resume?: File | null }
  ) => {
    const form = new FormData();
    form.append('name', data.name);
    form.append('email', data.email);
    form.append('phone', data.phone);
    if (data.resume) form.append('resume', data.resume);
    return publicUpload<{ applied: boolean }>(
      `/public/${encodeURIComponent(slug)}/jobs/${jobId}/apply`,
      form
    );
  },

  /* Public AI Hiring Readiness self-assessment (unauthenticated) */
  readinessSubmit: (data: {
    org_name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    answers: Record<string, number>;
  }) =>
    publicRequest<{
      submitted: boolean;
      total: number;
      tier: string;
      tier_label: string;
      recommendations: { dimension: string; score: number; module: string }[];
    }>('/readiness', { method: 'POST', body: JSON.stringify(data) }),

  /* Recruiter Poll & Assessment (tenant + poll scoped) */
  pollGetMeta: (tenantSlug: string) =>
    publicRequest<{
      slug: string;
      name: string;
      logoInitials: string;
      primaryColor: string;
      logoUrl?: string | null;
      polls: import('../types').PollSummary[];
    }>(`/poll/${encodeURIComponent(tenantSlug)}/meta`),
  pollGetPollMeta: (tenantSlug: string, pollSlug: string) =>
    publicRequest<{
      slug: string;
      name: string;
      logoInitials: string;
      primaryColor: string;
      logoUrl?: string | null;
      poll: import('../types').PollSummary;
    }>(`/poll/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(pollSlug)}/meta`),
  pollRegister: (
    tenantSlug: string,
    pollSlug: string,
    data: { name: string; email: string; mobile: string; company_name: string }
  ) =>
    publicRequest<{
      recruiter: import('../types').PollRecruiter;
      tenant: { slug: string; name: string };
      poll: import('../types').PollSummary;
    }>(`/poll/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(pollSlug)}/register`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  pollGetQuestions: (tenantSlug: string, pollSlug: string) =>
    publicRequest<{
      questions: import('../types').PollQuestionPublic[];
      total: number;
      tenant: { slug: string; name: string };
      poll: import('../types').PollSummary;
    }>(`/poll/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(pollSlug)}/questions`),
  pollSubmit: (
    tenantSlug: string,
    pollSlug: string,
    recruiterId: number,
    answers: { question_id: number; selected_option: number }[]
  ) =>
    publicRequest<{
      result: import('../types').PollResult;
      motivation: import('../types').PollMotivation;
    }>(`/poll/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(pollSlug)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ recruiter_id: recruiterId, answers }),
    }),
  pollGetResult: (tenantSlug: string, pollSlug: string, recruiterId: number) =>
    publicRequest<{
      result: import('../types').PollResult;
      motivation: import('../types').PollMotivation;
    }>(
      `/poll/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(pollSlug)}/result/${recruiterId}`
    ),
  pollListPolls: () => request<{ polls: import('../types').Poll[] }>('/poll/polls'),
  pollCreatePoll: (data: { title: string; slug?: string; description?: string }) =>
    request<{ poll: import('../types').PollSummary }>('/poll/polls', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  pollUpdatePoll: (
    pollId: number,
    data: Partial<{ title: string; slug: string; description: string | null; status: string; is_default: boolean }>
  ) =>
    request<{ poll: import('../types').PollSummary }>(`/poll/polls/${pollId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  pollDeletePoll: (pollId: number) =>
    request<void>(`/poll/polls/${pollId}`, { method: 'DELETE' }),
  pollGetDashboard: (pollId: number) =>
    request<import('../types').PollDashboard>(`/poll/dashboard?pollId=${pollId}`),
  pollGetRecruiters: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{
      poll?: import('../types').PollSummary;
      recruiters: import('../types').PollRecruiter[];
    }>(`/poll/recruiters${q}`);
  },
  pollGetRecruiterResponses: (id: number) =>
    request<{
      recruiter: import('../types').PollRecruiter;
      responses: Array<{
        id: number;
        question_id: number;
        selected_option: number;
        is_correct: boolean;
        question: string;
        option1: string;
        option2: string;
        option3: string;
        option4: string;
        correct_option: number;
        sort_order: number;
      }>;
    }>(`/poll/recruiters/${id}/responses`),
  pollExportRecruiters: (pollId: number) =>
    download(`/poll/export/recruiters?pollId=${pollId}`, 'poll-recruiters.csv'),
  pollAdminGetQuestions: (pollId: number) =>
    request<{
      poll?: import('../types').PollSummary;
      questions: import('../types').PollQuestionAdmin[];
    }>(`/poll/admin/questions?pollId=${pollId}`),
  pollAdminCreateQuestion: (pollId: number, data: Partial<import('../types').PollQuestionAdmin>) =>
    request<{ question: import('../types').PollQuestionAdmin }>(
      `/poll/admin/questions?pollId=${pollId}`,
      {
        method: 'POST',
        body: JSON.stringify({ ...data, pollId }),
      }
    ),
  pollAdminUpdateQuestion: (id: number, data: Partial<import('../types').PollQuestionAdmin>) =>
    request<{ question: import('../types').PollQuestionAdmin }>(`/poll/admin/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  pollAdminDeleteQuestion: (id: number) =>
    request<void>(`/poll/admin/questions/${id}`, { method: 'DELETE' }),
};
