import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RecruiterDashboard from './dashboards/RecruiterDashboard';
import AdminDashboard from './dashboards/AdminDashboard';
import HiringManagerDashboard from './dashboards/HiringManagerDashboard';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'super_admin') return <Navigate to="/platform" replace />;
  if (user?.role === 'admin') return <AdminDashboard />;
  if (user?.role === 'hiring_manager') return <HiringManagerDashboard />;
  return <RecruiterDashboard />;
}
