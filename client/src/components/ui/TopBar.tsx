import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import OrgSwitcher from './OrgSwitcher';

interface TopBarProps {
  breadcrumbs?: BreadcrumbItem[];
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  searchValue?: string;
}

export default function TopBar({
  breadcrumbs,
  searchPlaceholder = 'Search candidates, jobs… (⌘K)',
  onSearch,
  searchValue,
}: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <OrgSwitcher />
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      </div>
      <div className="topbar-center">
        <input
          className="search-bar input-field"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={onSearch ? (e) => onSearch(e.target.value) : undefined}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
              e.preventDefault();
              navigate('/candidates');
            }
          }}
        />
      </div>
      <div className="topbar-right">
        <div className="quick-actions-wrap">
          <button type="button" className="icon-btn" title="Quick actions" onClick={() => navigate('/candidates/new')}>
            +
          </button>
          <button type="button" className="icon-btn notification-btn" title="Notifications">
            🔔
            <span className="notification-badge">3</span>
          </button>
          <div className="avatar-menu">
            <button
              type="button"
              className="avatar-btn"
              onClick={() => navigate('/settings/profile')}
              title={user?.name}
            >
              {user?.name?.charAt(0) || 'U'}
            </button>
            <button
              type="button"
              className="button-pill button-secondary btn-sm"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
