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

export interface ParsedExperience {
  title: string;
  company: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  year?: string | null;
}

export interface ParsedProject {
  name: string;
  description?: string | null;
  technologies?: string[];
}

export interface ParsedCertification {
  name: string;
  issuer?: string | null;
  date?: string | null;
}

export interface ParsedProfile {
  name: string;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  current_company?: string | null;
  previous_companies?: string[];
  experience?: ParsedExperience[];
  education?: ParsedEducation[];
  projects?: ParsedProject[];
  skills?: string[];
  technical_skills?: string[];
  soft_skills?: string[];
  certifications?: ParsedCertification[];
  current_salary?: string | null;
  expected_salary?: string | null;
  notice_period?: string | null;
  current_location?: string | null;
  preferred_location?: string | null;
  languages?: string[];
  professional_summary?: string | null;
  total_experience_years?: number | null;
  confidence: number;
}

export interface ResumeMeta {
  storage_path?: string;
  original_filename?: string;
  mime_type?: string;
  file_size_bytes?: number;
  ai_confidence?: number;
  parsed_at?: string;
}

export interface ResumeParseResponse {
  parsed_profile: ParsedProfile;
  ai_confidence: number;
  pending_resume_id: string;
  pending_ext: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  source: string;
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
  parsed_profile?: ParsedProfile | null;
  resume_meta?: ResumeMeta | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  current_company?: string | null;
  current_location?: string | null;
  preferred_location?: string | null;
  notice_period?: string | null;
  current_salary?: string | null;
  professional_summary?: string | null;
  education?: ParsedEducation[];
  experience?: ParsedExperience[];
  projects?: ParsedProject[];
  certifications?: ParsedCertification[];
  languages?: string[];
  technical_skills?: string[];
  soft_skills?: string[];
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

export interface InterviewVideoTokenResponse {
  serverUrl: string;
  token: string;
  roomName: string;
  participantName: string;
  interview: {
    id: number;
    candidateName: string;
    scheduledAt: string;
    roundType: string;
    meetingLink?: string;
    evaluation?: InterviewEvaluation | null;
  };
}

export interface InterviewJoinPreview {
  interviewId: number;
  candidateName: string;
  tenantName: string;
  scheduledAt: string;
  roundType: string;
  status: string;
  livekitConfigured: boolean;
  joinWindowOpen?: boolean;
}

/** BPO/CRM screening scorecard filled during the live interview call. */
export interface InterviewEvaluation {
  self_intro?: number | null;
  topic_5min?: number | null;
  hobbies_elaborate?: number | null;
  not_on_resume?: number | null;
  family_background?: number | null;
  work_life_balance?: number | null;
  customer_service?: number | null;
  strengths_elaborate?: number | null;
  bpo_definition?: number | null;
  why_bpo_career?: number | null;
  handle_irate_customer?: number | null;
  retain_disconnecting_customer?: number | null;
  favourite_movie?: number | null;
  short_term_goal?: number | null;
  long_term_goal?: number | null;
  five_year_vision?: number | null;
  why_organization?: number | null;
  why_hire_you?: number | null;
  salary_expectation?: number | null;
  total_score: number;
  questions_scored: number;
  max_score: number;
  overall_score?: number | null;
  notes?: string | null;
  updated_by?: number;
  updated_at?: string;
}

export type InterviewQuestionId = keyof Omit<
  InterviewEvaluation,
  'total_score' | 'questions_scored' | 'max_score' | 'overall_score' | 'notes' | 'updated_by' | 'updated_at'
>;

export interface InterviewScreeningQuestion {
  id: InterviewQuestionId;
  label: string;
  hint: string;
  timeSeconds?: number;
  category: 'introduction' | 'domain' | 'behavioral' | 'goals';
}

export const INTERVIEW_SCREENING_CATEGORIES: {
  id: InterviewScreeningQuestion['category'];
  label: string;
}[] = [
  { id: 'introduction', label: 'Introduction & Personal' },
  { id: 'domain', label: 'BPO / Customer Service' },
  { id: 'behavioral', label: 'Behavioral & Communication' },
  { id: 'goals', label: 'Goals & Fit' },
];

export const INTERVIEW_SCREENING_QUESTIONS: InterviewScreeningQuestion[] = [
  {
    id: 'self_intro',
    label: 'Introduce Yourself',
    category: 'introduction',
    timeSeconds: 120,
    hint: 'GM/GA/GE, name, hometown, current location, family, education, strengths, hobbies. Example: "Team-Player, Respect and Hardworking."',
  },
  {
    id: 'topic_5min',
    label: 'Pick a topic of your choice and speak for 5 minutes',
    category: 'introduction',
    timeSeconds: 300,
    hint: 'Hometown (geography, culture, economy) or About Bangalore (festivals, IT companies, sightseeing spots like Lalbagh, Nandi Hills).',
  },
  {
    id: 'hobbies_elaborate',
    label: 'Hobbies (Elaborate)',
    category: 'introduction',
    timeSeconds: 120,
    hint: 'Cooking new dishes (share a recipe) or exploring new places (e.g. Mysore Palace, Chamundi Hills, local food).',
  },
  {
    id: 'not_on_resume',
    label: 'Share something not on your resume',
    category: 'introduction',
    timeSeconds: 90,
    hint: 'Short-term objective, long-term goals, strengths, and weaknesses (e.g. shy, stage fear — working on it).',
  },
  {
    id: 'family_background',
    label: 'Family background in brief',
    category: 'introduction',
    timeSeconds: 90,
    hint: 'Family size, parents\' occupation, siblings\' work. Example: father farmer, mother housemaker, elder sister MIS Analyst.',
  },
  {
    id: 'work_life_balance',
    label: 'What do you understand by work-life balance? How do you manage it?',
    category: 'domain',
    timeSeconds: 90,
    hint: 'Balance between professional responsibilities and personal life without sacrificing well-being. Manage time, prioritize self-care and leisure.',
  },
  {
    id: 'customer_service',
    label: 'What is Customer Service?',
    category: 'domain',
    timeSeconds: 90,
    hint: 'Assistance before/after purchase: product suggestions, troubleshooting, complaints, general questions.',
  },
  {
    id: 'strengths_elaborate',
    label: 'What are your strengths? (Elaborate)',
    category: 'domain',
    timeSeconds: 120,
    hint: 'Team-Player (helped teammate in debate), Respect (active listening in lectures), Hardworking (Hindi medium → CRM prep).',
  },
  {
    id: 'bpo_definition',
    label: 'What is BPO?',
    category: 'domain',
    timeSeconds: 90,
    hint: 'Business Process Outsourcing — non-primary activities (customer care, back office, technical support) outsourced to another company.',
  },
  {
    id: 'why_bpo_career',
    label: 'Why start your career in the BPO industry?',
    category: 'domain',
    timeSeconds: 90,
    hint: 'Leading international industry, best place to build career as fresher, matches educational qualification.',
  },
  {
    id: 'handle_irate_customer',
    label: 'How to handle an irate customer?',
    category: 'domain',
    timeSeconds: 90,
    hint: 'Stay calm, listen without interrupting, empathize, apologize sincerely, take ownership, focus on quick solution. Escalate to manager if needed.',
  },
  {
    id: 'retain_disconnecting_customer',
    label: 'How would you convince a customer to stay when they want to disconnect?',
    category: 'domain',
    timeSeconds: 120,
    hint: 'Apologize, address root cause, take ownership with clear roadmap solution, offer goodwill as temporary fix.',
  },
  {
    id: 'favourite_movie',
    label: 'Narrate your favourite movie',
    category: 'behavioral',
    timeSeconds: 300,
    hint: '5-minute narration — plot, characters, why it resonates, communication clarity and engagement.',
  },
  {
    id: 'short_term_goal',
    label: 'What is your short-term goal?',
    category: 'goals',
    timeSeconds: 120,
    hint: 'Getting into a good MNC company, clearing CRM Associate interview.',
  },
  {
    id: 'long_term_goal',
    label: 'What is your long-term goal?',
    category: 'goals',
    timeSeconds: 120,
    hint: 'Gain experience in Customer Care Management, build L&D skills to become a mentor.',
  },
  {
    id: 'five_year_vision',
    label: 'Where do you see yourself in the next 5 years?',
    category: 'goals',
    timeSeconds: 90,
    hint: 'A good challenging profile, personally and financially satisfied.',
  },
  {
    id: 'why_organization',
    label: 'Why this organization? Why work with us?',
    category: 'goals',
    timeSeconds: 90,
    hint: 'Leading international MNC, best place to build career as fresher.',
  },
  {
    id: 'why_hire_you',
    label: 'Why should we hire you?',
    category: 'goals',
    timeSeconds: 90,
    hint: 'Strengths, education and interest match requirements — suitable candidate for the role.',
  },
  {
    id: 'salary_expectation',
    label: 'What is your salary expectation?',
    category: 'goals',
    timeSeconds: 60,
    hint: 'As per company market standards.',
  },
];

export const INTERVIEW_QUESTION_IDS = INTERVIEW_SCREENING_QUESTIONS.map((q) => q.id);

export function interviewEvaluationSummary(evaluation?: InterviewEvaluation | null): string | null {
  if (!evaluation || evaluation.questions_scored === 0) return null;
  const overall = evaluation.overall_score != null ? `${evaluation.overall_score}/10` : `${evaluation.total_score}/${evaluation.max_score}`;
  return `${overall} · ${evaluation.questions_scored}/${INTERVIEW_SCREENING_QUESTIONS.length} questions`;
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
  evaluation?: InterviewEvaluation | null;
}

export interface Message {
  id: number;
  candidate_id: number;
  sender: string;
  content: string;
  is_outgoing: boolean;
  sent_at: string;
  /** Present on outbound messages after send (not persisted in DB yet). */
  wa_status?: 'sent' | 'simulated' | 'failed';
  wa_error?: string;
}

export interface MessagingIntegrationStatus {
  mode: 'live' | 'simulated';
  enabled: boolean;
  webhookPath: string;
  configured: {
    phoneNumberId: boolean;
    accessToken: boolean;
    verifyToken: boolean;
  };
  ready: boolean;
  missing: string[];
  /** False when live mode is on but Meta rejects the access token. */
  tokenOk?: boolean;
  authError?: string;
  ai: 'live' | 'disabled';
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
