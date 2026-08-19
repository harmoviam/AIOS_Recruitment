import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider } from './context/TenantContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import CareersPage from './pages/public/CareersPage';
import CareersJobPage from './pages/public/CareersJobPage';
import AIReadinessPage from './pages/public/AIReadinessPage';
import WalkthroughPage from './pages/WalkthroughPage';
import { loginRedirectPath } from './utils/tenantUrl';
import DashboardPage from './pages/DashboardPage';
import PipelinePage from './pages/PipelinePage';
import CandidatesListPage from './pages/CandidatesListPage';
import AddCandidatePage from './pages/AddCandidatePage';
import MassScreenPage from './pages/MassScreenPage';
import ImportCandidatesPage from './pages/ImportCandidatesPage';
import ImportCandidatesFolderPage from './pages/ImportCandidatesFolderPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import FollowUpCenterPage from './pages/FollowUpCenterPage';
import JobsPage from './pages/JobsPage';
import RecruitersPage from './pages/RecruitersPage';
import HiringManagersPage from './pages/HiringManagersPage';
import CompaniesPage from './pages/CompaniesPage';
import MessagesPage from './pages/MessagesPage';
import InterviewsPage from './pages/InterviewsPage';
import InterviewRoomPage from './pages/InterviewRoomPage';
import InterviewEvaluationPage from './pages/InterviewEvaluationPage';
import JoinInterviewPage from './pages/JoinInterviewPage';
import ReportsPage from './pages/ReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/settings/ProfilePage';
import TenantSettingsPage from './pages/settings/TenantSettingsPage';
import BillingPage from './pages/settings/BillingPage';
import PlatformDashboardPage from './pages/platform/PlatformDashboardPage';
import TenantsPage from './pages/platform/TenantsPage';
import PlatformPlansPage from './pages/platform/PlatformPlansPage';
import PollEntryPage from './pages/poll/PollEntryPage';
import PollListPage from './pages/poll/PollListPage';
import PollRegisterPage from './pages/poll/PollRegisterPage';
import PollAssessmentPage from './pages/poll/PollAssessmentPage';
import PollResultPage from './pages/poll/PollResultPage';
import PollRecruiterDashboardPage from './pages/poll/PollRecruiterDashboardPage';
import PollAdminDashboardPage from './pages/poll/PollAdminDashboardPage';
import SourcingSearchPage from './pages/sourcing/SearchPage';
import SourcingCopilotPage from './pages/sourcing/CopilotPage';
import SourcingPeoplePage from './pages/sourcing/PeoplePage';
import SourcingCampaignsPage from './pages/sourcing/CampaignsPage';
import SourcingDashboardPage from './pages/sourcing/DashboardPage';
import SourcingContentStudioPage from './pages/sourcing/ContentStudioPage';
import SourcingSourcesPage from './pages/sourcing/SourcesPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) {
    const slug = localStorage.getItem('aios_tenant_slug');
    return <Navigate to={loginRedirectPath(slug)} replace />;
  }
  return <>{children}</>;
}

function PlatformRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'super_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Organization workspace routes — not for Platform Admin (master). */
function OrgWorkspaceRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'super_admin') return <Navigate to="/platform" replace />;
  return <>{children}</>;
}

/** Organization admin settings — team, WhatsApp, billing, etc. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/settings/profile" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/new" element={<LoginPage />} />
      <Route path="/login/:tenantSlug/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/login/:tenantSlug" element={<LoginPage />} />
      <Route path="/platform/login" element={<LoginPage />} />
      <Route path="/walkthrough" element={<WalkthroughPage />} />
      <Route path="/walkthrough/:role" element={<WalkthroughPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/join/interview/:joinToken" element={<JoinInterviewPage />} />
      <Route path="/careers/:tenantSlug" element={<CareersPage />} />
      <Route path="/careers/:tenantSlug/jobs/:jobId" element={<CareersJobPage />} />
      <Route path="/ai-readiness" element={<AIReadinessPage />} />
      <Route path="/poll" element={<PollEntryPage />} />
      <Route path="/poll/:tenantSlug" element={<PollListPage />} />
      <Route path="/poll/:tenantSlug/:pollSlug" element={<PollRegisterPage />} />
      <Route path="/poll/:tenantSlug/:pollSlug/assessment" element={<PollAssessmentPage />} />
      <Route path="/poll/:tenantSlug/:pollSlug/result" element={<PollResultPage />} />
      <Route path="/poll/:tenantSlug/:pollSlug/dashboard" element={<PollRecruiterDashboardPage />} />
      <Route
        path="/interviews/:id/room"
        element={
          <PrivateRoute>
            <TenantProvider>
              <InterviewRoomPage />
            </TenantProvider>
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <TenantProvider>
              <Layout />
            </TenantProvider>
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="candidates" element={<OrgWorkspaceRoute><CandidatesListPage /></OrgWorkspaceRoute>} />
        <Route path="candidates/new" element={<OrgWorkspaceRoute><AddCandidatePage /></OrgWorkspaceRoute>} />
        <Route path="candidates/mass-screen" element={<OrgWorkspaceRoute><MassScreenPage /></OrgWorkspaceRoute>} />
        <Route path="candidates/import" element={<OrgWorkspaceRoute><ImportCandidatesPage /></OrgWorkspaceRoute>} />
        <Route path="candidates/import-folder" element={<OrgWorkspaceRoute><ImportCandidatesFolderPage /></OrgWorkspaceRoute>} />
        <Route path="candidates/:id" element={<OrgWorkspaceRoute><CandidateDetailPage /></OrgWorkspaceRoute>} />
        <Route path="pipeline" element={<OrgWorkspaceRoute><PipelinePage /></OrgWorkspaceRoute>} />
        <Route path="follow-ups" element={<OrgWorkspaceRoute><FollowUpCenterPage /></OrgWorkspaceRoute>} />
        <Route path="jobs" element={<OrgWorkspaceRoute><JobsPage /></OrgWorkspaceRoute>} />
        <Route path="recruiters" element={<OrgWorkspaceRoute><RecruitersPage /></OrgWorkspaceRoute>} />
        <Route path="hiring-managers" element={<OrgWorkspaceRoute><HiringManagersPage /></OrgWorkspaceRoute>} />
        <Route path="companies" element={<OrgWorkspaceRoute><CompaniesPage /></OrgWorkspaceRoute>} />
        <Route path="messages" element={<OrgWorkspaceRoute><MessagesPage /></OrgWorkspaceRoute>} />
        <Route path="interviews" element={<OrgWorkspaceRoute><InterviewsPage /></OrgWorkspaceRoute>} />
        <Route path="interviews/:id/evaluate" element={<OrgWorkspaceRoute><InterviewEvaluationPage /></OrgWorkspaceRoute>} />
        <Route path="reports" element={<OrgWorkspaceRoute><ReportsPage /></OrgWorkspaceRoute>} />
        <Route path="analytics" element={<OrgWorkspaceRoute><AnalyticsPage /></OrgWorkspaceRoute>} />
        <Route path="sourcing" element={<OrgWorkspaceRoute><AdminRoute><SourcingDashboardPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="sourcing/search" element={<OrgWorkspaceRoute><AdminRoute><SourcingSearchPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="sourcing/copilot" element={<OrgWorkspaceRoute><AdminRoute><SourcingCopilotPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="sourcing/people" element={<OrgWorkspaceRoute><AdminRoute><SourcingPeoplePage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="sourcing/campaigns" element={<OrgWorkspaceRoute><AdminRoute><SourcingCampaignsPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="sourcing/dashboard" element={<OrgWorkspaceRoute><AdminRoute><SourcingDashboardPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="sourcing/content" element={<OrgWorkspaceRoute><AdminRoute><SourcingContentStudioPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="sourcing/sources" element={<OrgWorkspaceRoute><AdminRoute><SourcingSourcesPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route
          path="poll-admin"
          element={
            <OrgWorkspaceRoute>
              <AdminRoute>
                <PollAdminDashboardPage />
              </AdminRoute>
            </OrgWorkspaceRoute>
          }
        />
        <Route path="settings" element={<OrgWorkspaceRoute><AdminRoute><SettingsPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="settings/profile" element={<ProfilePage />} />
        <Route path="settings/organization" element={<OrgWorkspaceRoute><AdminRoute><TenantSettingsPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route path="settings/billing" element={<OrgWorkspaceRoute><AdminRoute><BillingPage /></AdminRoute></OrgWorkspaceRoute>} />
        <Route
          path="platform"
          element={
            <PlatformRoute>
              <PlatformDashboardPage />
            </PlatformRoute>
          }
        />
        <Route
          path="platform/tenants"
          element={
            <PlatformRoute>
              <TenantsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="platform/tenants/:slug"
          element={
            <PlatformRoute>
              <TenantsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="platform/plans"
          element={
            <PlatformRoute>
              <PlatformPlansPage />
            </PlatformRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
