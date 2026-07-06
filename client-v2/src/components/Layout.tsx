import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import PlanBadge from './ui/PlanBadge';
import { ROLE_LABELS } from '../types';

type NavItem = { to: string; label: string; end?: boolean; badge?: number; platformOnly?: boolean; orgOnly?: boolean; feature?: string; recruiterLabel?: string; hmLabel?: string; adminOnly?: boolean; hmHidden?: boolean; recruiterOnly?: boolean; hmOnly?: boolean };
type NavSection = { title?: string; orgOnly?: boolean; items: NavItem[] };

const navSections: NavSection[] = [
  {
    items: [{ to: '/', label: 'Dashboard', end: true, orgOnly: true }, { to: '/platform', label: 'Platform Overview', end: true, platformOnly: true }],
  },
  {
    title: 'Candidates',
    orgOnly: true,
    items: [
      { to: '/candidates', label: 'All Candidates', recruiterLabel: 'My Candidates', hmHidden: true, orgOnly: true },
      { to: '/candidates?scope=my', label: 'My Candidates', hmOnly: true, orgOnly: true },
      { to: '/candidates?scope=team', label: 'My Team Candidates', hmOnly: true, orgOnly: true },
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

const ICON_PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  userPlus: 'M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  kanban: 'M5 3h4v18H5zM15 3h4v12h-4z',
  briefcase: 'M4 7h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2',
  userCheck: 'M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11l2 2 4-4',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M20 21V11a2 2 0 0 0-2-2h-2M2 21h20M8 7h2M8 11h2M8 15h2',
  chat: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5Z',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM16 2v4M8 2v4M3 10h18',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M16 13H8M16 17H8M10 9H8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V18a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  creditCard: 'M2 6h20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM1 10h22',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6 6 18M6 6l12 12',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name] ?? ICON_PATHS.grid} />
    </svg>
  );
}

function iconFor(to: string): string {
  const path = to.split('?')[0];
  switch (path) {
    case '/': return 'home';
    case '/platform': return 'grid';
    case '/candidates': return to.includes('filter=new') ? 'userPlus' : 'users';
    case '/follow-ups': return 'bell';
    case '/pipeline': return 'kanban';
    case '/jobs': return 'briefcase';
    case '/recruiters': return 'userCheck';
    case '/hiring-managers': return 'users';
    case '/companies': return 'building';
    case '/messages': return 'chat';
    case '/interviews': return 'calendar';
    case '/reports': return 'fileText';
    case '/analytics': return 'chart';
    case '/platform/tenants': return 'building';
    case '/platform/plans': return 'creditCard';
    case '/settings': return 'settings';
    case '/settings/organization': return 'sliders';
    case '/settings/billing': return 'creditCard';
    case '/settings/profile': return 'user';
    default: return 'grid';
  }
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { tenant, isPlatformAdmin, can } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isOrgAdmin = user?.role === 'admin';
  const isHm = user?.role === 'hiring_manager';
  const isRecruiter = user?.role === 'recruiter';
  const canManageRecruiters = isOrgAdmin || isHm;

  // Close the mobile drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const navLabel = (item: NavItem) => {
    if (isRecruiter && item.recruiterLabel) return item.recruiterLabel;
    if (isHm && item.hmLabel) return item.hmLabel;
    return item.label;
  };

  // Items whose `to` carries a query string (e.g. /candidates?scope=my) must match
  // the current query too — otherwise all of them light up on the shared pathname.
  const isItemActive = (item: NavItem, routerActive: boolean) => {
    const qIndex = item.to.indexOf('?');
    if (qIndex === -1) return routerActive;
    if (location.pathname !== item.to.slice(0, qIndex)) return false;
    const current = new URLSearchParams(location.search);
    for (const [key, value] of new URLSearchParams(item.to.slice(qIndex + 1))) {
      if (current.get(key) !== value) return false;
    }
    return true;
  };

  const renderNav = (opts: { collapsed?: boolean } = {}) =>
    navSections.map((section, si) => {
      if (isPlatformAdmin && section.orgOnly) return null;
      if (!isPlatformAdmin && section.items.every((i) => i.platformOnly)) return null;

      const visibleItems = section.items.filter((item) => {
        if (item.platformOnly && !isPlatformAdmin) return false;
        if (item.orgOnly && isPlatformAdmin) return false;
        if (item.to === '/recruiters' && !canManageRecruiters) return false;
        if (item.adminOnly && !isOrgAdmin) return false;
        if (item.recruiterOnly && !isRecruiter) return false;
        if (item.hmOnly && !isHm) return false;
        if (item.hmHidden && isHm) return false;
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
          {section.title && !opts.collapsed && <div className="nav-section-title">{section.title}</div>}
          {deduped.map((item) => (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isItemActive(item, isActive) ? ' active' : ''}`}
              title={navLabel(item)}
            >
              <Icon name={iconFor(item.to)} size={19} />
              <span className="nav-label">{navLabel(item)}</span>
              {item.badge != null && isRecruiter && <span className="nav-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </div>
      );
    });

  const brandName = isPlatformAdmin ? 'AIOS Platform' : tenant.name;
  const brandInitials = isPlatformAdmin ? 'AI' : tenant.logoInitials;
  const brandColor = isPlatformAdmin ? undefined : { background: tenant.primaryColor };

  const bottomNavItems: { to: string; label: string; icon: string; end?: boolean }[] = isPlatformAdmin
    ? [
        { to: '/platform', label: 'Overview', icon: 'grid', end: true },
        { to: '/platform/tenants', label: 'Orgs', icon: 'building' },
        { to: '/platform/plans', label: 'Plans', icon: 'creditCard' },
        { to: '/settings/profile', label: 'Profile', icon: 'user' },
      ]
    : [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/pipeline', label: 'Pipeline', icon: 'kanban' },
        { to: '/candidates', label: 'Candidates', icon: 'users' },
        { to: '/messages', label: 'Inbox', icon: 'chat' },
      ];

  const userBlock = (
    <div className="sidebar-user">
      <div className="sidebar-user-avatar">{user?.name?.charAt(0) ?? 'U'}</div>
      <div className="sidebar-user-info">
        <div className="sidebar-user-name">{user?.name}</div>
        <div className="sidebar-user-role">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo" style={brandColor}>{brandInitials}</div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={15} />
          </button>
        </div>

        {!collapsed && (
          <div className="sidebar-tenant-meta">
            <span className="sidebar-tenant-name">{brandName}</span>
            {!isPlatformAdmin && <PlanBadge plan={tenant.plan} status={tenant.status} />}
          </div>
        )}

        <nav className="sidebar-nav">{renderNav({ collapsed })}</nav>

        {!collapsed && userBlock}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="mobile-drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="mobile-drawer" role="dialog" aria-label="Navigation menu">
            <div className="sidebar-brand">
              <div className="sidebar-logo" style={brandColor}>{brandInitials}</div>
              <button
                type="button"
                className="mobile-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="sidebar-tenant-meta">
              <span className="sidebar-tenant-name">{brandName}</span>
              {!isPlatformAdmin && <PlanBadge plan={tenant.plan} status={tenant.status} />}
            </div>
            <nav className="sidebar-nav">{renderNav()}</nav>
            {userBlock}
            <button
              type="button"
              className="mobile-drawer-signout"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </aside>
        </>
      )}

      <div className="main-content">
        {/* Mobile top header */}
        <header className="mobile-header">
          <button
            type="button"
            className="mh-menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" size={22} />
          </button>
          <div className="mh-brand">
            <div className="mh-logo" style={brandColor}>{brandInitials}</div>
            <span className="mh-title">{brandName}</span>
          </div>
          <NavLink to="/settings/profile" className="mh-avatar" aria-label="Profile">
            {user?.name?.charAt(0) ?? 'U'}
          </NavLink>
        </header>

        <Outlet />
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="bottom-nav" aria-label="Primary">
        <div className="bottom-nav-inner">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
            >
              <Icon name={item.icon} size={21} />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            className={`bottom-nav-item${drawerOpen ? ' active' : ''}`}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" size={21} />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
