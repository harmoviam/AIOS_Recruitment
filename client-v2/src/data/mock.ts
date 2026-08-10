export interface FollowUp {
  id: number;
  candidateId: number;
  candidateName: string;
  jobTitle: string;
  dueAt: string;
  type: 'call' | 'whatsapp' | 'email';
  status: 'today' | 'overdue' | 'upcoming' | 'completed' | 'missed';
  aiSuggestion?: string;
}

export interface Company {
  id: number;
  name: string;
  industry: string;
  location: string;
  openJobs: number;
  hiringManager: string;
  status: 'active' | 'archived';
}

export interface HiringManager {
  id: number;
  name: string;
  email: string;
  company: string;
  openJobs: number;
  pendingReviews: number;
  status: 'active' | 'inactive';
}

export interface RecruiterStats {
  id: number;
  name: string;
  email: string;
  activeJobs: number;
  candidates: number;
  joiningsMtd: number;
  status: 'active' | 'inactive';
}

export interface ImportRow {
  row: number;
  name: string;
  phone: string;
  issue: string;
  severity: 'error' | 'warning' | 'duplicate';
}

export const MOCK_FOLLOW_UPS: FollowUp[] = [
  {
    id: 1,
    candidateId: 1,
    candidateName: 'Raj Kumar',
    jobTitle: 'Java Developer',
    dueAt: new Date(Date.now() - 86400000).toISOString(),
    type: 'call',
    status: 'overdue',
    aiSuggestion: 'No response in 5 days — try WhatsApp with JD link',
  },
  {
    id: 2,
    candidateId: 2,
    candidateName: 'Neha Shah',
    jobTitle: 'QA Lead',
    dueAt: new Date().toISOString(),
    type: 'whatsapp',
    status: 'today',
    aiSuggestion: 'Candidate opened JD email — good time to call',
  },
  {
    id: 3,
    candidateId: 3,
    candidateName: 'Amit Patel',
    jobTitle: 'Python Backend',
    dueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    type: 'email',
    status: 'upcoming',
  },
  {
    id: 4,
    candidateId: 4,
    candidateName: 'Priya Singh',
    jobTitle: 'UI/UX Designer',
    dueAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    type: 'call',
    status: 'missed',
    aiSuggestion: 'Escalation: 3+ missed attempts',
  },
];

export const MOCK_COMPANIES: Company[] = [
  { id: 1, name: 'TCS', industry: 'IT Services', location: 'Mumbai', openJobs: 8, hiringManager: 'Anil Mehta', status: 'active' },
  { id: 2, name: 'Infosys', industry: 'IT Services', location: 'Bangalore', openJobs: 3, hiringManager: 'Sara Joshi', status: 'active' },
  { id: 3, name: 'Thoughtworks', industry: 'Consulting', location: 'Pune', openJobs: 1, hiringManager: 'Anil Mehta', status: 'active' },
  { id: 4, name: 'Global Services', industry: 'BPO', location: 'Mumbai', openJobs: 12, hiringManager: 'Ravi Nair', status: 'active' },
];

export const MOCK_HIRING_MANAGERS: HiringManager[] = [
  { id: 1, name: 'Anil Mehta', email: 'anil@acme.com', company: 'TCS', openJobs: 8, pendingReviews: 5, status: 'active' },
  { id: 2, name: 'Sara Joshi', email: 'sara@techstart.com', company: 'Infosys', openJobs: 3, pendingReviews: 0, status: 'active' },
  { id: 3, name: 'Ravi Nair', email: 'ravi@global.com', company: 'Global Services', openJobs: 12, pendingReviews: 2, status: 'active' },
];

export const MOCK_RECRUITER_STATS: RecruiterStats[] = [
  { id: 1, name: 'Priya Verma', email: 'priya@aios.com', activeJobs: 8, candidates: 342, joiningsMtd: 3, status: 'active' },
  { id: 2, name: 'Rohit Singh', email: 'rohit@aios.com', activeJobs: 5, candidates: 198, joiningsMtd: 1, status: 'active' },
];

export const MOCK_IMPORT_ROWS: ImportRow[] = [
  { row: 12, name: '', phone: '+919876543210', issue: 'Missing name', severity: 'error' },
  { row: 45, name: 'Raj K', phone: '+919988776655', issue: 'Duplicate of candidate #892', severity: 'duplicate' },
  { row: 78, name: 'Amit', phone: 'invalid', issue: 'Invalid phone format', severity: 'error' },
  { row: 102, name: 'Sneha', phone: '+919911223344', issue: 'Email format invalid', severity: 'warning' },
];

export const STAGE_COLORS: Record<string, string> = {
  applied: '#2563EB',
  screening: '#D97706',
  screening_rejected: '#9A3412',
  interview: '#4F46E5',
  selected: '#0D9488',
  email_sent: '#0284C7',
  ho_pending: '#C026D3',
  rejected: '#6B7280',
  joined: '#059669',
  new: '#2563EB',
  left_company: '#DC2626',
  not_interested: '#6B7280',
  offer_rejected: '#DC2626',
  joined_elsewhere: '#B45309',
  doing_well: '#16A34A',
  issue_flagged: '#EA580C',
  no_answer: '#CA8A04',
};
