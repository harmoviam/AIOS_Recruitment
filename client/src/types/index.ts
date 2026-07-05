export type UserRole = 'super_admin' | 'admin' | 'recruiter' | 'hiring_manager';
export type TenantPlan = 'starter' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'trial' | 'suspended' | 'churned';

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  primaryColor: string;
  logoInitials: string;
  usersCount: number;
  candidatesCount: number;
  createdAt: string;
  trialEndsAt?: string;
  features: string[];
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole | string;
  tenant_id?: number;
  tenant_slug?: string;
}

export interface Candidate {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  skills: string[];
  experience_years: number;
  ai_score: number;
  stage: string;
  job_id?: number;
  job_title?: string;
  recruiter_id?: number;
  recruiter_name?: string;
  notes?: string;
  salary_expectation?: string;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: number;
  title: string;
  client: string;
  location: string;
  status: string;
  assigned_to?: number;
  assigned_name?: string;
  open_positions: number;
  description?: string;
  pipeline_count?: number;
  match_percent?: number;
}

export interface Interview {
  id: number;
  candidate_id: number;
  candidate_name?: string;
  scheduled_at: string;
  duration_minutes: number;
  round_type: string;
  status: string;
  meeting_link?: string;
  notes?: string;
  score?: number;
}

export interface Message {
  id: number;
  candidate_id: number;
  sender: string;
  content: string;
  is_outgoing: boolean;
  sent_at: string;
}

export interface Conversation {
  id: number;
  name: string;
  phone?: string;
  stage: string;
  last_message?: string;
  last_message_at?: string;
}

export interface Activity {
  id: number;
  type: string;
  description: string;
  created_at: string;
}

export const STAGES = [
  { id: 'applied', label: 'Applied' },
  { id: 'screening', label: 'Screening' },
  { id: 'interview', label: 'Interview Scheduled' },
  { id: 'selected', label: 'Selected' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'joined', label: 'Joined' },
] as const;

export type StageId = (typeof STAGES)[number]['id'];

export interface FollowUp {
  id: number;
  candidate_id: number;
  candidate_name?: string;
  job_title?: string;
  due_at: string;
  type: string;
  status: string;
  notes?: string;
  ai_suggestion?: string;
  assignee_name?: string;
}

export interface Company {
  id: number;
  name: string;
  industry?: string;
  location?: string;
  status: string;
  open_jobs?: number;
  hiring_manager?: string;
}

export interface HiringManager {
  id: number;
  name: string;
  email: string;
  company: string;
  openJobs: number;
  pendingReviews: number;
  recruiterCount: number;
  teamJoiningsMtd: number;
  status: string;
  company_id?: number;
}

export interface RecruiterStat {
  id: number;
  name: string;
  email: string;
  company?: string;
  company_id?: number;
  managed_by_id?: number | null;
  hiringManager?: string;
  activeJobs: number;
  candidates: number;
  joiningsMtd: number;
  rank: number;
  status: string;
}

export interface HmDashboard {
  openPositions: number;
  selections: number;
  joiningsMtd: number;
  recruiterCount?: number;
  pendingApprovals: { id: number; name: string; job_title?: string; recruiter_name?: string }[];
}

export interface TimelineEvent {
  id: number;
  source: 'activity' | 'message' | 'interview' | 'follow_up';
  type?: string;
  description?: string;
  content?: string;
  sender?: string;
  status?: string;
  created_at: string;
}

export interface ImportValidation {
  valid: number;
  errors: number;
  warnings: number;
  issues: { row: number; name?: string; phone?: string; issue: string; severity: string }[];
}

export interface OrgHmSummary {
  id: number;
  name: string;
  email: string;
  company: string;
  recruiterCount: number;
  teamJoiningsMtd: number;
  teamCandidates: number;
}

export interface OrgRecruiterSummary {
  id: number;
  name: string;
  email: string;
  company: string;
  hiringManager: string;
  candidates: number;
  joiningsMtd: number;
  activeJobs: number;
  rank: number;
}

export interface OrganizationOverview {
  kpis: {
    hiring_managers: number;
    recruiters: number;
    candidates: number;
    active_jobs: number;
    joinings_mtd: number;
  };
  hiringManagers: OrgHmSummary[];
  recruiters: OrgRecruiterSummary[];
  funnel: { stage: string; count: number }[];
}

export interface TeamPerformanceRecruiter {
  id: number;
  name: string;
  email: string;
  candidates: number;
  inInterview: number;
  joiningsMtd: number;
  pendingFollowups: number;
  conversionRate: number;
  rank: number;
}

export interface TeamPerformance {
  team: {
    candidates: number;
    joiningsMtd: number;
    inInterview: number;
    pendingFollowups: number;
  };
  recruiters: TeamPerformanceRecruiter[];
}

export interface RecruiterWorkflow {
  kpis: {
    totalCandidates: number;
    pendingFollowups: number;
    overdueFollowups: number;
    interviewsToday: number;
    joiningsMtd: number;
  };
  pipeline: { stage: string; count: number }[];
  recentActivities: Activity[];
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Platform Admin',
  admin: 'Organization Admin',
  hiring_manager: 'Hiring Manager',
  recruiter: 'Recruiter',
};
