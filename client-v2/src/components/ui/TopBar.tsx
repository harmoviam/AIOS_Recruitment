import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { NotificationItem } from '../../types';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import OrgSwitcher from './OrgSwitcher';

const NOTIFICATION_ICONS: Record<NotificationItem['kind'], string> = {
  follow_up_overdue: '⏰',
  follow_up_today: '📞',
  interview_today: '📅',
  hot_candidate: '🔥',
};

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getNotifications().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="notification-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notification-btn"
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        🔔
        {items.length > 0 && <span className="notification-badge">{items.length > 9 ? '9+' : items.length}</span>}
      </button>
      {open && (
        <div className="org-dropdown notification-dropdown">
          <div className="org-dropdown-header">Notifications</div>
          {items.length === 0 ? (
            <p className="notification-empty">You&apos;re all caught up 🎉</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className="org-option notification-item"
                onClick={() => {
                  setOpen(false);
                  navigate(n.link);
                }}
              >
                <span className="notification-icon">{NOTIFICATION_ICONS[n.kind]}</span>
                <span className="org-option-text">
                  <strong>{n.title}</strong>
                  <span className="text-muted">
                    {n.detail}
                    {n.kind === 'interview_today' &&
                      ` · ${new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

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
          <NotificationBell />
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
