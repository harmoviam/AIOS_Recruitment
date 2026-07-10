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
  wa_signature?: string | null;
  tenant_id?: number;
  tenant_slug?: string;
}

export type ScreeningRiskLevel = 'High Join Probability' | 'Moderate Risk' | 'High Ghosting Risk';

/** Pre-screening scorecard captured by recruiters on the first call. */
export interface ScreeningAssessment {
  commitment_language?: number | null;
  future_clarity?: number | null;
  opportunity_competition?: number | null;
  motivation_strength?: number | null;
  stability_indicators?: number | null;
  low_energy?: number | null;
  vague_motivation?: number | null;
  uncertain_joining_timeline?: number | null;
  avoids_current_status?: number | null;
  salary_focus_early?: number | null;
  weak_communication?: number | null;
  non_committed_language?: number | null;
  total_score: number;
  total_red_flags: number;
  risk_level: ScreeningRiskLevel | string;
  updated_by?: number;
  updated_at?: string;
}

export const SCREENING_QUESTIONS: { id: keyof ScreeningAssessment & string; label: string; hint: string }[] = [
  { id: 'commitment_language', label: 'Commitment Language', hint: 'Says "I will", "Yes I can", "I\'m available" — not "maybe", "try", "let\'s see".' },
  { id: 'future_clarity', label: 'Future Clarity', hint: 'Clear about career direction, notice period and joining timeline.' },
  { id: 'opportunity_competition', label: 'Opportunity Competition', hint: 'Low competing-offer risk — not juggling multiple interviews/offers.' },
  { id: 'motivation_strength', label: 'Motivation Strength', hint: 'Gives specific, genuine reasons for wanting this role.' },
  { id: 'stability_indicators', label: 'Stability Indicators', hint: 'Work history and current situation suggest they will stay.' },
];

export const RED_FLAG_SIGNALS: { id: keyof ScreeningAssessment & string; label: string; hint: string }[] = [
  { id: 'low_energy', label: 'Low Energy', hint: 'Very short answers, no curiosity about the role, sounds distracted.' },
  { id: 'vague_motivation', label: 'Vague Motivation', hint: 'Ask "Why this role?" — red flags: "just looking for a job", "someone told me to apply", "trying my luck".' },
  { id: 'uncertain_joining_timeline', label: 'Uncertain Joining Timeline', hint: 'Ask "How soon can you join?" — red flags: "maybe next month", "let\'s see", "depends".' },
  { id: 'avoids_current_status', label: 'Avoids Current Status', hint: 'Ask "Currently working or interviewing?" — hesitation, changing answers, avoiding clarity.' },
  { id: 'salary_focus_early', label: 'Salary Focus Early', hint: 'Asks "what is the salary?" in the first minute, before understanding the role.' },
  { id: 'weak_communication', label: 'Weak Communication', hint: 'One-word answers, long pauses, asks no questions.' },
  { id: 'non_committed_language', label: 'Non-Committed Language', hint: 'Uses "maybe", "try", "let\'s see", "hopefully" instead of "I will", "yes I can".' },
];

export function screeningRiskLevel(totalScore: number): ScreeningRiskLevel {
  if (totalScore >= 20) return 'High Join Probability';
  if (totalScore >= 15) return 'Moderate Risk';
  return 'High Ghosting Risk';
}

export function riskBadgeClass(riskLevel: string): string {
  if (riskLevel === 'High Join Probability') return 'risk-badge risk-join';
  if (riskLevel === 'Moderate Risk') return 'risk-badge risk-moderate';
  return 'risk-badge risk-ghosting';
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
  screening?: ScreeningAssessment | null;
  is_hot?: boolean;
  offer_status?: string | null;
  interview_date?: string | null;
  joined_at?: string | null;
  expected_joining_at?: string | null;
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
  tenure_days?: number | null;
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
  unread_hint?: number;
}

export interface NotificationItem {
  id: string;
  kind: 'follow_up_overdue' | 'follow_up_today' | 'interview_today' | 'hot_candidate';
  title: string;
  detail: string;
  link: string;
  at: string;
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

export type FollowUpCategory =
  | 'interview_prep'
  | 'interview_day'
  | 'no_response'
  | 'offer_followup'
  | 'onboarding'
  | 'manual';

export const FOLLOW_UP_CATEGORIES: { id: FollowUpCategory; label: string; hint: string }[] = [
  { id: 'interview_prep', label: 'Interview: day before', hint: 'Confirm attendance a day ahead' },
  { id: 'interview_day', label: 'Interview: same day', hint: 'Final confirmation on interview day' },
  { id: 'no_response', label: 'Not picking calls', hint: 'Escalations when candidate is unreachable' },
  { id: 'offer_followup', label: 'Selected → joining', hint: '1 week before, 1 day before & joining day' },
  { id: 'onboarding', label: 'Post-joining check-ins', hint: 'Day 7 / 15 / 30 / 45 / 61 / 80 / 91 — trimmed to the job tenure' },
  { id: 'manual', label: 'Manual', hint: 'Created by recruiters' },
];

/** The three follow-up flows the Follow-up Center is organised around. */
export type FollowUpFlow = 'pre_interview' | 'post_selected' | 'post_joining' | 'manual';

export const FOLLOW_UP_FLOWS: {
  id: FollowUpFlow;
  label: string;
  icon: string;
  tagline: string;
  steps: string[];
  categories: FollowUpCategory[];
}[] = [
  {
    id: 'pre_interview',
    label: 'Pre-Interview',
    icon: '🎯',
    tagline: 'Screening cleared → interview scheduled',
    steps: ['1 day before', 'Interview day'],
    categories: ['interview_prep', 'interview_day', 'no_response'],
  },
  {
    id: 'post_selected',
    label: 'Post-Selected',
    icon: '🤝',
    tagline: 'Offer made → joining confirmed',
    steps: ['1 week before', '1 day before', 'Joining day'],
    categories: ['offer_followup'],
  },
  {
    id: 'post_joining',
    label: 'Post-Joining',
    icon: '🏁',
    tagline: 'Joined → retention check-ins',
    steps: ['Day 7', 'Day 15', 'Day 30', 'Day 45', 'Day 61', 'Day 80', 'Day 91'],
    categories: ['onboarding'],
  },
  {
    id: 'manual',
    label: 'Manual',
    icon: '✍️',
    tagline: 'Created by recruiters',
    steps: [],
    categories: ['manual'],
  },
];

export const OUTCOME_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  connected: 'Connected',
  no_answer: 'No answer',
  rescheduled: 'Rescheduled',
  not_interested: 'Not interested',
  offer_rejected: 'Offer rejected',
  joined_elsewhere: 'Joined elsewhere',
  doing_well: 'Doing well',
  issue_flagged: 'Issue flagged',
  left_company: 'Left company',
  done: 'Done',
  auto_closed: 'Auto-closed',
};

/** milestone_day → label for Post-Selected joining reminders (-7 / -1 / 0). */
export const JOINING_MILESTONE_LABELS: Record<number, string> = {
  [-7]: '1 week before joining',
  [-1]: '1 day before joining',
  [0]: 'Joining day',
};

/** Human label for the step a follow-up represents in its flow. */
export function followUpStepLabel(
  category?: string | null,
  milestoneDay?: number | null
): string | null {
  switch (category) {
    case 'interview_prep':
      return '1 day before interview';
    case 'interview_day':
      return 'Interview day';
    case 'no_response':
      return 'Unreachable — escalated retry';
    case 'offer_followup':
      if (milestoneDay == null) return 'Confirm joining date';
      return JOINING_MILESTONE_LABELS[milestoneDay] ?? `Day ${milestoneDay}`;
    case 'onboarding':
      return milestoneDay != null ? `Day ${milestoneDay} check-in` : 'Check-in';
    default:
      return null;
  }
}

export interface FollowUp {
  id: number;
  candidate_id: number;
  candidate_name?: string;
  candidate_phone?: string;
  candidate_email?: string;
  candidate_stage?: string;
  candidate_joined_at?: string | null;
  candidate_expected_joining_at?: string | null;
  job_title?: string;
  due_at: string;
  type: string;
  status: string;
  category?: FollowUpCategory | string;
  outcome?: string;
  milestone_day?: number;
  interview_id?: number;
  interview_at?: string;
  interview_round?: string;
  escalated?: boolean;
  notes?: string;
  ai_suggestion?: string;
  message_template?: string | null;
  assignee_name?: string;
  completed_at?: string;
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
  actor_name?: string | null;
  is_outgoing?: boolean;
  status?: string;
  created_at: string;
  // Follow-up events only — what was captured when the follow-up was worked.
  notes?: string | null;
  outcome?: string | null;
  category?: string | null;
  milestone_day?: number | null;
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
    selected: number;
    joined: number;
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
    selected: number;
    joined: number;
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
