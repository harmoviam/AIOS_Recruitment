import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import PlanBadge from './ui/PlanBadge';
import { ROLE_LABELS } from '../types';

type NavItem = { to: string; label: string; end?: boolean; badge?: number; platformOnly?: boolean; orgOnly?: boolean; feature?: string; recruiterLabel?: string; hmLabel?: string; adminOnly?: boolean; hmHidden?: boolean; recruiterOnly?: boolean };
type NavSection = { title?: string; orgOnly?: boolean; items: NavItem[] };

const navSections: NavSection[] = [
  {
    items: [{ to: '/', label: 'Dashboard', end: true, orgOnly: true }, { to: '/platform', label: 'Platform Overview', end: true, platformOnly: true }],
  },
  {
    title: 'Candidates',
    orgOnly: true,
    items: [
      { to: '/candidates', label: 'All Candidates', recruiterLabel: 'My Candidates', hmLabel: 'Team Candidates', orgOnly: true },
      { to: '/candidates?filter=new', label: 'New Candidates', recruiterOnly: true, orgOnly: true },
      { to: '/follow-ups', label: 'Follow-ups', badge: 5, orgOnly: true },
      { to: '/pipeline', label: 'Pipeline (Kanban)', orgOnly: true },
    ],
  },
  {
    title: 'Jobs & People',
    orgOnly: true,
    items: [
      { to: '/jobs', label: 'Jobs', orgOnly: true },
      { to: '/recruiters', label: 'Recruiters', hmLabel: 'My Recruiters', orgOnly: true },
      { to: '/hiring-managers', label: 'Hiring Managers', adminOnly: true, orgOnly: true },
      { to: '/companies', label: 'Companies', adminOnly: true, orgOnly: true },
    ],
  },
  {
    title: 'Workspace',
    orgOnly: true,
    items: [
      { to: '/follow-ups', label: 'Follow-up Center', orgOnly: true },
      { to: '/messages', label: 'WhatsApp', orgOnly: true },
      { to: '/interviews', label: 'Calendar', orgOnly: true },
      { to: '/reports', label: 'Reports', hmHidden: false, orgOnly: true },
    ],
  },
  {
    title: 'Platform',
    items: [
      { to: '/platform/tenants', label: 'Organizations', platformOnly: true },
      { to: '/platform/plans', label: 'Plans & Pricing', platformOnly: true },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', adminOnly: true, orgOnly: true },
      { to: '/settings/organization', label: 'Organization', adminOnly: true, orgOnly: true },
      { to: '/settings/billing', label: 'Billing & Plan', adminOnly: true, orgOnly: true },
      { to: '/settings/profile', label: 'Profile' },
    ],
  },
];

export default function Layout() {
  const { user } = useAuth();
  const { tenant, isPlatformAdmin, can } = useTenant();
  const [collapsed, setCollapsed] = useState(false);

  const isOrgAdmin = user?.role === 'admin';
  const isHm = user?.role === 'hiring_manager';
  const isRecruiter = user?.role === 'recruiter';
  const canManageRecruiters = isOrgAdmin || isHm;

  const navLabel = (item: NavItem) => {
    if (isRecruiter && item.recruiterLabel) return item.recruiterLabel;
    if (isHm && item.hmLabel) return item.hmLabel;
    return item.label;
  };

  return (
    <div className="app-shell">
      <div className="wireframe app-frame">
        <div className="wireframe-frame">
          <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
            <div className="sidebar-brand">
              <div className="sidebar-logo" style={{ background: isPlatformAdmin ? '#0f172a' : tenant.primaryColor }}>
                {isPlatformAdmin ? 'AI' : tenant.logoInitials}
              </div>
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setCollapsed(!collapsed)}
                aria-label="Toggle sidebar"
              >
                {collapsed ? '→' : '←'}
              </button>
            </div>

            {!collapsed && (
              <div className="sidebar-tenant-meta">
                <span className="sidebar-tenant-name">{isPlatformAdmin ? 'AIOS Platform' : tenant.name}</span>
                {!isPlatformAdmin && <PlanBadge plan={tenant.plan} status={tenant.status} />}
              </div>
            )}

            <nav className="sidebar-nav">
              {navSections.map((section, si) => {
                if (isPlatformAdmin && section.orgOnly) return null;
                if (!isPlatformAdmin && section.items.every((i) => i.platformOnly)) return null;

                const visibleItems = section.items.filter((item) => {
                  if (item.platformOnly && !isPlatformAdmin) return false;
                  if (item.orgOnly && isPlatformAdmin) return false;
                  if (item.to === '/recruiters' && !canManageRecruiters) return false;
                  if (item.adminOnly && !isOrgAdmin) return false;
                  if (item.recruiterOnly && !isRecruiter) return false;
                  if (item.feature && !can(item.feature)) return false;
                  return true;
                });
                if (visibleItems.length === 0) return null;

                const seen = new Set<string>();
                const deduped = visibleItems.filter((item) => {
                  if (seen.has(item.to)) return false;
                  seen.add(item.to);
                  return true;
                });

                return (
                  <div key={si} className="nav-section">
                    {section.title && !collapsed && <div className="nav-section-title">{section.title}</div>}
                    {deduped.map((item) => (
                      <NavLink
                        key={item.to + item.label}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                        title={collapsed ? navLabel(item) : undefined}
                      >
                        {!collapsed && navLabel(item)}
                        {collapsed && navLabel(item).charAt(0)}
                        {item.badge != null && !collapsed && isRecruiter && <span className="nav-badge">{item.badge}</span>}
                      </NavLink>
                    ))}
                  </div>
                );
              })}
            </nav>

            {!collapsed && (
              <div className="sidebar-user">
                <div className="sidebar-user-name">{user?.name}</div>
                <div className="sidebar-user-role">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
              </div>
            )}
          </aside>
          <div className="main-content">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
