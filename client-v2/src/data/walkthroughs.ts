export type WalkthroughRole = 'platform' | 'org-admin' | 'hiring-manager' | 'recruiter';

export interface WalkthroughStep {
  title: string;
  narration: string;
  durationSec: number;
  scene: 'login' | 'dashboard' | 'nav' | 'action' | 'success';
  highlights?: string[];
  mockNav?: string[];
  mockKpis?: { label: string; value: string }[];
  mockRows?: string[];
}

export interface WalkthroughGuide {
  role: WalkthroughRole;
  title: string;
  subtitle: string;
  accent: string;
  icon: string;
  loginUrl: string;
  demoEmail: string;
  demoPassword: string;
  orgExample?: string;
  steps: WalkthroughStep[];
  /** Optional embed URL (YouTube, Loom, etc.) — set via env or replace when you have real videos */
  videoUrl?: string;
}

const DEMO_PASSWORD = 'password123';

export const WALKTHROUGH_GUIDES: Record<WalkthroughRole, WalkthroughGuide> = {
  platform: {
    role: 'platform',
    title: 'Platform Admin',
    subtitle: 'Master control — organizations, plans & billing',
    accent: '#0f172a',
    icon: '⚙️',
    loginUrl: '/platform/login',
    demoEmail: 'super@aios.com',
    demoPassword: DEMO_PASSWORD,
    videoUrl: import.meta.env.VITE_WALKTHROUGH_VIDEO_PLATFORM,
    steps: [
      {
        title: 'Open Platform sign-in',
        narration: 'Go to the Platform Admin login — separate from any client organization URL.',
        durationSec: 5,
        scene: 'login',
        highlights: ['Select Platform Admin', 'super@aios.com', 'password123'],
      },
      {
        title: 'Platform Overview',
        narration: 'See all client organizations, trial status, total users, and estimated MRR at a glance.',
        durationSec: 6,
        scene: 'dashboard',
        mockKpis: [
          { label: 'Active Tenants', value: '4' },
          { label: 'On Trial', value: '1' },
          { label: 'Total Users', value: '116' },
          { label: 'MRR (est.)', value: '₹4.2L' },
        ],
      },
      {
        title: 'Manage Organizations',
        narration: 'Provision tenants, assign plans, view sign-in URLs, and monitor usage per agency.',
        durationSec: 6,
        scene: 'action',
        mockRows: ['StaffPro Agency — Pro — Active', 'EarlyJobs — Pro — Active', 'TalentBridge — Enterprise'],
      },
      {
        title: 'Plans & Pricing',
        narration: 'Define Starter, Pro, and Enterprise limits — recruiters and candidate caps per plan.',
        durationSec: 5,
        scene: 'nav',
        mockNav: ['Organizations', 'Plans & Pricing', 'Profile'],
      },
      {
        title: 'You\'re ready',
        narration: 'Platform Admin never manages recruiters or candidates — that stays with each Organization Admin.',
        durationSec: 4,
        scene: 'success',
        highlights: ['No recruitment ops', 'Org provisioning only'],
      },
    ],
  },
  'org-admin': {
    role: 'org-admin',
    title: 'Organization Admin',
    subtitle: 'Full control of your agency workspace',
    accent: '#2563EB',
    icon: '🏢',
    loginUrl: '/login/staffpro-agency',
    demoEmail: 'admin@aios.com',
    demoPassword: DEMO_PASSWORD,
    orgExample: 'StaffPro Agency',
    videoUrl: import.meta.env.VITE_WALKTHROUGH_VIDEO_ORG_ADMIN,
    steps: [
      {
        title: 'Your unique sign-in URL',
        narration: 'Each organization has its own login link — bookmark /login/your-org-slug for your team.',
        durationSec: 5,
        scene: 'login',
        highlights: ['/login/staffpro-agency', 'admin@aios.com'],
      },
      {
        title: 'Organization Dashboard',
        narration: 'Monitor all hiring managers, recruiters, candidates, and joinings across the org.',
        durationSec: 6,
        scene: 'dashboard',
        mockKpis: [
          { label: 'Hiring Managers', value: '3' },
          { label: 'Recruiters', value: '12' },
          { label: 'Candidates', value: '12.4K' },
          { label: 'Joinings MTD', value: '28' },
        ],
      },
      {
        title: 'Manage Hiring Managers',
        narration: 'Create HMs, assign companies, share login details, and reset passwords.',
        durationSec: 6,
        scene: 'action',
        mockRows: ['Anil Mehta — TCS — 2 recruiters', 'Login details drawer', 'Reset password'],
      },
      {
        title: 'Manage all Recruiters',
        narration: 'Add recruiters org-wide, assign company + HM, filter by team, view performance.',
        durationSec: 6,
        scene: 'nav',
        mockNav: ['Recruiters', 'Hiring Managers', 'Companies', 'All Candidates'],
      },
      {
        title: 'Org settings & reports',
        narration: 'Configure branding, billing, run reports, and export data for the whole organization.',
        durationSec: 5,
        scene: 'success',
        highlights: ['Settings', 'Reports', 'Import/Export'],
      },
    ],
  },
  'hiring-manager': {
    role: 'hiring-manager',
    title: 'Hiring Manager',
    subtitle: 'Lead your recruiter team & client hiring',
    accent: '#0D9488',
    icon: '👔',
    loginUrl: '/login/staffpro-agency',
    demoEmail: 'anil.mehta@client.com',
    demoPassword: DEMO_PASSWORD,
    orgExample: 'StaffPro Agency · TCS',
    videoUrl: import.meta.env.VITE_WALKTHROUGH_VIDEO_HM,
    steps: [
      {
        title: 'Sign in to your org',
        narration: 'Use your organization\'s login URL — same page as other roles, with your HM email.',
        durationSec: 5,
        scene: 'login',
        highlights: ['anil.mehta@client.com', 'StaffPro Agency'],
      },
      {
        title: 'HM Dashboard',
        narration: 'Track your team\'s candidates, interviews, joinings, and recruiter performance rankings.',
        durationSec: 6,
        scene: 'dashboard',
        mockKpis: [
          { label: 'My Recruiters', value: '2' },
          { label: 'Team Candidates', value: '340' },
          { label: 'In Interview', value: '18' },
          { label: 'Team Joinings MTD', value: '6' },
        ],
      },
      {
        title: 'Add & manage recruiters',
        narration: 'Go to My Recruiters → Add Recruiter. New hires auto-link to your company and report to you.',
        durationSec: 6,
        scene: 'action',
        mockRows: ['+ Add Recruiter', 'Priya Verma — 89 candidates', 'Rohit Singh — 72 candidates'],
      },
      {
        title: 'Team candidates & approvals',
        narration: 'Review Team Candidates, approve selected profiles, and monitor pipeline for your client.',
        durationSec: 6,
        scene: 'nav',
        mockNav: ['Team Candidates', 'Pipeline', 'Follow-ups', 'Reports'],
      },
      {
        title: 'Share login with new HMs',
        narration: 'Your Org Admin creates HM accounts — you focus on recruiters and placements.',
        durationSec: 4,
        scene: 'success',
        highlights: ['My Recruiters', 'Team performance'],
      },
    ],
  },
  recruiter: {
    role: 'recruiter',
    title: 'Recruiter',
    subtitle: 'Your personal recruiting workflow',
    accent: '#7C3AED',
    icon: '🎯',
    loginUrl: '/login/staffpro-agency',
    demoEmail: 'priya@aios.com',
    demoPassword: DEMO_PASSWORD,
    orgExample: 'StaffPro Agency',
    videoUrl: import.meta.env.VITE_WALKTHROUGH_VIDEO_RECRUITER,
    steps: [
      {
        title: 'Sign in to your workspace',
        narration: 'Recruiters use the same org login URL — enter your email and password.',
        durationSec: 5,
        scene: 'login',
        highlights: ['priya@aios.com', '/login/staffpro-agency'],
      },
      {
        title: 'My Workflow dashboard',
        narration: 'Your home screen: candidates, follow-ups, today\'s interviews, and joinings this month.',
        durationSec: 6,
        scene: 'dashboard',
        mockKpis: [
          { label: 'My Candidates', value: '89' },
          { label: 'Follow-ups', value: '12' },
          { label: 'Interviews Today', value: '3' },
          { label: 'Joinings MTD', value: '2' },
        ],
      },
      {
        title: 'Manage your pipeline',
        narration: 'Add candidates, move stages on Kanban, set follow-ups, and import from CSV.',
        durationSec: 6,
        scene: 'action',
        mockRows: ['+ Add Candidate', 'Pipeline Kanban', 'Import CSV', 'AI score sorting'],
      },
      {
        title: 'Day-to-day tools',
        narration: 'WhatsApp messages, interview calendar, and follow-up center keep you on track.',
        durationSec: 5,
        scene: 'nav',
        mockNav: ['My Candidates', 'Follow-ups', 'Calendar', 'WhatsApp'],
      },
      {
        title: 'Start recruiting',
        narration: 'You only see your own candidates — your Hiring Manager sees the full team view.',
        durationSec: 4,
        scene: 'success',
        highlights: ['Personal pipeline', 'Hot candidates AI picks'],
      },
    ],
  },
};

export const WALKTHROUGH_ROLE_ORDER: WalkthroughRole[] = [
  'platform',
  'org-admin',
  'hiring-manager',
  'recruiter',
];

export function getWalkthrough(role: string | undefined): WalkthroughGuide | null {
  if (!role) return null;
  return WALKTHROUGH_GUIDES[role as WalkthroughRole] ?? null;
}
