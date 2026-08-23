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
  logoUrl?: string | null;
  usersCount: number;
  candidatesCount: number;
  createdAt: string;
  trialEndsAt?: string;
  features: string[];
}

export interface CareersTenant {
  slug: string;
  name: string;
  primary_color: string;
  logo_initials: string;
  logo_url: string | null;
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

/**
 * Offline fallback used only when the red-flag endpoint is unreachable. It has
 * no scripted question text, so the UI falls back to the bare signal + hint.
 */
export const FALLBACK_RED_FLAG_QUESTIONS: RedFlagQuestion[] = RED_FLAG_SIGNALS.map((q) => ({
  ...q,
  ask: '',
  good_answer: '',
  red_answer: '',
  time_seconds: 60,
}));

export type ExperienceBand = 'fresher' | 'junior' | 'mid' | 'senior';

/**
 * Standard red-flag probe for the first 5-7 minutes, worded for the job's role,
 * required experience, and sector. Served by the API — never generated here.
 */
export interface RedFlagQuestion {
  id: keyof ScreeningAssessment & string;
  label: string;
  ask: string;
  good_answer: string;
  red_answer: string;
  hint: string;
  time_seconds: number;
}

export interface SalaryAlignment {
  expectation: string | null;
  job_max: string | null;
  ratio: number | null;
  level: 'ok' | 'tight' | 'over_budget' | 'unknown';
  message: string;
}

export interface RedFlagPack {
  job_id: number | null;
  job_title: string | null;
  industry: string | null;
  experience_band: ExperienceBand;
  experience_band_label: string;
  questions: RedFlagQuestion[];
  salary_alignment: SalaryAlignment;
  duration_seconds: number;
  total_seconds: number;
}

/** ATS score for an uploaded resume — 0-100, distinct from the 0-10 ai_score. */
export interface AtsCategoryScore {
  key: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface AtsScoreResult {
  score: number;
  grade: 'Excellent' | 'Good' | 'Average' | 'Poor';
  categories: AtsCategoryScore[];
  missing: string[];
  recommendations: string[];
  matched_keywords: string[];
  missing_keywords: string[];
  scored_against_job: boolean;
  computed_at: string;
}

export function atsScoreClass(score: number): string {
  if (score >= 85) return 'ats-badge ats-excellent';
  if (score >= 70) return 'ats-badge ats-good';
  if (score >= 50) return 'ats-badge ats-average';
  return 'ats-badge ats-poor';
}

export function screeningRiskLevel(totalScore: number, maxScore = 25): ScreeningRiskLevel {
  const joinThreshold = Math.ceil(maxScore * 0.8);
  const moderateThreshold = Math.ceil(maxScore * 0.6);
  if (totalScore >= joinThreshold) return 'High Join Probability';
  if (totalScore >= moderateThreshold) return 'Moderate Risk';
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

export interface ExperienceGateResult {
  passed: boolean;
  candidate_years: number;
  required_years: number | null;
  reason: string | null;
}

export interface EmploymentSpan {
  title: string;
  company: string;
  start_date: string | null;
  end_date: string | null;
  years: number | null;
}

export interface ExperienceConsistencyResult {
  employment_years_sum: number | null;
  employment_years: number | null;
  claimed_years: number | null;
  effective_years: number | null;
  roles: EmploymentSpan[];
  mismatch: boolean;
  mismatch_delta: number | null;
  reason: string | null;
}

export interface ResumeParseResponse {
  parsed_profile: ParsedProfile;
  ai_confidence: number;
  ats_score: number | null;
  ats: AtsScoreResult | null;
  experience_gate?: ExperienceGateResult;
  experience_rejected?: boolean;
  experience_consistency?: ExperienceConsistencyResult;
  pending_resume_id: string;
  pending_ext: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  source: string;
}

export interface EligibilityScoreResult {
  score: number;
  mandatory_matched: string[];
  mandatory_missing: string[];
  preferred_matched: string[];
  preferred_missing: string[];
  mandatory_rate: number;
  preferred_rate: number;
}

export type MassScreenSlotStatus =
  | 'queued'
  | 'parsing'
  | 'scored'
  | 'error'
  | 'decided'
  | 'skipped';

export interface MassScreenSlot {
  slot: number;
  status: MassScreenSlotStatus;
  filename?: string;
  error?: string;
  original_filename?: string;
  parsed_profile?: ParsedProfile;
  ats_score?: number;
  ats_score_10?: number;
  ats?: AtsScoreResult;
  eligibility_score?: number;
  eligibility?: EligibilityScoreResult;
  experience_years?: number;
  min_experience_required?: number | null;
  experience_rejected?: boolean;
  experience_gate?: ExperienceGateResult;
  experience_consistency?: ExperienceConsistencyResult;
  ai_status?: 'pending' | 'done' | 'skipped';
  ai_summary?: string;
  ai_strengths?: string[];
  ai_gaps?: string[];
  decision?: 'shortlisted' | 'rejected';
  remarks?: string;
  candidate_id?: number;
}

export interface MassScreenBatch {
  id: string;
  tenant_id: number;
  job_id: number;
  created_by: number | null;
  status: 'processing' | 'ready' | 'completed';
  slots: MassScreenSlot[];
  created_at?: string;
  updated_at?: string;
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
  /** 0-100 resume quality/JD-match score, set after the resume is parsed. */
  ats_score?: number | null;
  ats_details?: AtsScoreResult | null;
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
  latitude?: number | null;
  longitude?: number | null;
  relocation_allowed?: boolean;
  age?: number | null;
  gender?: string | null;
  highest_qualification?: string | null;
  specialization?: string | null;
  preferred_job_type?: string | null;
  preferred_shift?: string | null;
  preferred_cities?: string[];
  created_at: string;
  updated_at: string;
}

export interface JobScreeningQuestions {
  prescreen: ScreeningQuestionDef[];
  interview: ScreeningQuestionDef[];
  generated_at?: string;
  source?: 'ai' | 'template' | 'default';
  /** Target budget for first-call screening (~5 min = 300s). */
  screening_duration_seconds?: number;
  /** Target budget for scheduled interview questions (~15 min = 900s). */
  scheduled_duration_seconds?: number;
  screening_total_seconds?: number;
  scheduled_total_seconds?: number;
  /** Sector the pack was written for. */
  industry?: string;
  /** Experience band the pack was pitched at. */
  experience_band?: ExperienceBand;
}

export const SCREENING_DURATION_SECONDS = 300;
export const SCHEDULED_DURATION_SECONDS = 900;

export function formatQuestionDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m} min`;
}

export interface ScreeningQuestionDef {
  id: string;
  label: string;
  hint: string;
  requirement?: string;
  category?: InterviewScreeningQuestion['category'] | 'technical';
  time_seconds?: number;
  /** Terms a solid answer should contain — the recruiter ticks off what they hear. */
  expected_keywords?: string[];
  /** What a 4-5 answer sounds like. */
  strong_answer?: string;
  /** What a 1-2 answer sounds like. */
  weak_answer?: string;
}

export interface JobRecommendation {
  id: number;
  title: string;
  company: string;
  distance: number | null;
  isRemote: boolean;
  matchScore: number;
  salary: string | null;
  reason: string;
  experience: string | null;
  qualification: string | null;
  languages: string[];
  jobType?: string | null;
  shift?: string | null;
  city?: string | null;
  description?: string | null;
}

export interface RecommendJobsResponse {
  recommendations: JobRecommendation[];
  suggestions?: {
    remote: number;
    hybrid: number;
    nearbyCities: string[];
  };
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
  screening_questions?: JobScreeningQuestions | null;
  tenure_days?: number | null;
  pipeline_count?: number;
  match_percent?: number;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  required_qualification?: string | null;
  required_languages?: string[];
  min_age?: number | null;
  max_age?: number | null;
  min_experience?: number | null;
  max_experience?: number | null;
  required_skills?: string[];
  preferred_skills?: string[];
  salary?: string | null;
  shift?: string | null;
  job_type?: string | null;
  gender_preference?: string | null;
  /** Sector (Information Technology, BPO, …) — distinct from job_type work mode. */
  industry?: string | null;
  /** LinkedIn SJP sync (from job_external_postings). */
  linkedin_status?: 'pending' | 'live' | 'closed' | 'error' | null;
  linkedin_last_error?: string | null;
  linkedin_last_synced_at?: string | null;
  linkedin_external_id?: string | null;
}

export interface LinkedInJobPostingStatus {
  provider: 'LINKEDIN';
  status: 'pending' | 'live' | 'closed' | 'error' | 'not_posted';
  externalJobPostingId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  configured: boolean;
}

export interface LinkedInJobCapabilities {
  configured: boolean;
  enabled: boolean;
  hasCredentials: boolean;
  hasCompanyUrn: boolean;
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
  id: string;
  label: string;
  hint: string;
  timeSeconds?: number;
  category: 'introduction' | 'domain' | 'behavioral' | 'goals' | 'technical';
  requirement?: string;
}

export const INTERVIEW_SCREENING_CATEGORIES: {
  id: InterviewScreeningQuestion['category'];
  label: string;
}[] = [
  { id: 'introduction', label: 'Introduction & Personal' },
  { id: 'technical', label: 'Role & Technical' },
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

export function interviewEvaluationSummary(
  evaluation?: InterviewEvaluation | null,
  questionCount = INTERVIEW_SCREENING_QUESTIONS.length
): string | null {
  if (!evaluation || evaluation.questions_scored === 0) return null;
  const overall = evaluation.overall_score != null ? `${evaluation.overall_score}/10` : `${evaluation.total_score}/${evaluation.max_score}`;
  return `${overall} · ${evaluation.questions_scored}/${questionCount} questions`;
}

/** Map API screening question defs to interview panel format. */
export function toInterviewPanelQuestions(questions: ScreeningQuestionDef[]): InterviewScreeningQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    label: q.label,
    hint: q.hint,
    requirement: q.requirement,
    category: (q.category as InterviewScreeningQuestion['category']) || 'technical',
    timeSeconds: q.time_seconds,
  }));
}

/** Categories present in a question set, in display order. */
export function categoriesForQuestions(questions: InterviewScreeningQuestion[]) {
  const order = INTERVIEW_SCREENING_CATEGORIES.map((c) => c.id);
  const present = new Set(questions.map((q) => q.category));
  return INTERVIEW_SCREENING_CATEGORIES.filter((c) => present.has(c.id)).sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id)
  );
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
  { id: 'email_sent', label: 'Email Sent' },
  { id: 'ho_pending', label: 'HO Pending' },
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
  { id: 'onboarding', label: 'Post-joining check-ins', hint: 'Day 7–90, then months 4/5/6 — trimmed to the job tenure' },
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
    steps: ['Day 7', 'Day 15', 'Day 30', 'Day 45', 'Day 60', 'Day 75', 'Day 90', 'Month 4', 'Month 5', 'Month 6'],
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
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  open_jobs?: number;
  hiring_manager?: string;
}

export interface NearbyCompany {
  id: number;
  name: string;
  industry: string | null;
  location: string | null;
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  distance_km: number;
  open_jobs: number;
  hiring_manager: string | null;
}

export interface NearbyCompaniesResponse {
  companies: NearbyCompany[];
  origin: { latitude: number; longitude: number };
  max_distance_km: number;
  message?: string;
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

export interface ImportFolderCandidate {
  filename: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  education: string;
  skills: string;
  summary: string;
}

export interface FolderImportOutcome {
  outcome: 'imported' | 'skipped_duplicate' | 'resume_attached';
  candidate_id: number;
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

export type WorkflowPeriod = 'today' | '7d' | '30d';

export interface RecruiterWorkflow {
  period?: WorkflowPeriod;
  kpis: {
    totalCandidates: number;
    pendingFollowups: number;
    overdueFollowups: number;
    interviewsToday: number;
    joiningsMtd: number;
    selected: number;
    rejected: number;
    emailSent: number;
    hoPending: number;
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

/* ── Recruiter Poll & Assessment ── */

export type PollStatus = 'open' | 'closed' | 'archived';

export interface PollSummary {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  status?: PollStatus;
  is_default?: boolean;
}

export interface Poll extends PollSummary {
  status: PollStatus;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
  question_count?: number;
  recruiter_count?: number;
  attempt_count?: number;
}

export interface PollRecruiter {
  id: number;
  name: string;
  email: string;
  mobile: string;
  company_name: string;
  created_at: string;
  poll_id?: number;
  score?: number | null;
  percentage?: number | null;
  status?: 'pass' | 'fail' | null;
  completed_at?: string | null;
  total_questions?: number | null;
  correct_answers?: number | null;
  wrong_answers?: number | null;
}

export interface PollQuestionPublic {
  id: number;
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  sort_order: number;
}

export interface PollQuestionAdmin extends PollQuestionPublic {
  correct_option: number;
  is_active: boolean;
  created_at?: string;
}

export interface PollResult {
  id: number;
  recruiter_id: number;
  name?: string;
  email?: string;
  mobile?: string;
  company_name?: string;
  score: number;
  percentage: number;
  status: 'pass' | 'fail';
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  completed_at: string;
}

export interface PollMotivation {
  tier: string;
  emoji: string;
  title: string;
  message: string;
}

export interface PollDashboard {
  tenant?: { id: number; slug: string; name: string };
  poll?: PollSummary;
  cards: {
    total_recruiters: number;
    total_attempts: number;
    average_score: number;
    pass_percentage: number;
    fail_percentage: number;
  };
  charts: {
    recruiter_scores: { name: string; score: number; percentage: number; status: string }[];
    company_participation: { company: string; recruiters: number }[];
    pass_vs_fail: { name: string; value: number; key: string }[];
    question_accuracy: {
      question: string;
      question_id: number;
      accuracy: number;
      attempts: number;
      correct_count: number;
      full_question: string;
    }[];
  };
}

/* ── Applications (candidate <-> job many-to-many) ─────────────────── */

export interface Application {
  id: number;
  tenant_id: number;
  candidate_id: number;
  job_id: number;
  stage: string;
  ai_score: number | null;
  offer_status: string | null;
  expected_joining_at: string | null;
  joined_at: string | null;
  recruiter_id: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  job_title?: string;
  job_client?: string;
  job_location?: string;
}

export interface JobPipelineApplication {
  application_id: number;
  stage: string;
  ai_score: number | null;
  offer_status: string | null;
  expected_joining_at: string | null;
  joined_at: string | null;
  updated_at: string;
  candidate_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number;
  is_hot: boolean;
  recruiter_name: string | null;
}

/* ── Billing ───────────────────────────────────────────────────────── */

export interface BillingPayment {
  id: number;
  plan: string;
  cycle: string;
  amount_inr: string | number;
  status: string;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface BillingInfo {
  mode: 'live' | 'disabled';
  plan: string;
  status: string;
  trial_ends_at: string | null;
  plan_expires_at: string | null;
  gstin: string | null;
  payments: BillingPayment[];
}

export interface BillingOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: string;
  cycle: string;
  tenantName: string;
}

/* ── Public careers pages ──────────────────────────────────────────── */

export interface PublicJob {
  id: number;
  title: string;
  location: string;
  description: string | null;
  open_positions: number;
  created_at: string;
}
