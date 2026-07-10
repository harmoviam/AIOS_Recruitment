import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import PageHeader from '../../components/ui/PageHeader';
import PlanBadge from '../../components/ui/PlanBadge';
import type { RecruiterStat } from '../../types';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { tenant } = useTenant();
  const isOrgAdmin = user?.role === 'admin';
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [stats, setStats] = useState<RecruiterStat | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.me().then((u) => {
      setName(u.name);
      setPhone(u.phone || '');
      setTimezone(u.timezone || 'Asia/Kolkata');
    });
    api.getRecruiterStats().then((all) => {
      const mine = all.find((s) => s.email === user?.email);
      setStats(mine || null);
    });
  }, [user?.email]);

  const handleSave = async () => {
    await api.updateProfile({ name, phone, timezone });
    await refreshUser?.();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <TopBar breadcrumbs={isOrgAdmin ? [{ label: 'Settings', href: '/settings' }, { label: 'Profile' }] : [{ label: 'Profile' }]} />
      <div className="page-content">
        <PageHeader title="Your Profile" description={`${tenant.name} · ${user?.role}`} />

        <div className="profile-header card">
          <div className="profile-avatar">{user?.name?.charAt(0)}</div>
          <div>
            <h2>{user?.name}</h2>
            <p className="text-muted">{user?.email}</p>
            <PlanBadge plan={tenant.plan} />
          </div>
        </div>

        <form className="card form-card" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full name</label>
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="input-field" type="email" defaultValue={user?.email} readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Timezone</label>
              <select className="input-field" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York (EST)</option>
              </select>
            </div>
          </div>
          <button type="submit" className="button-pill button-primary">{saved ? 'Saved ✓' : 'Save Changes'}</button>
        </form>

        {stats && (
          <div className="card">
            <h3 className="card-heading">My Stats</h3>
            <div className="perf-stats">
              <div><span className="perf-value">{stats.activeJobs}</span><span className="perf-label">Active Jobs</span></div>
              <div><span className="perf-value">{stats.candidates}</span><span className="perf-label">Candidates</span></div>
              <div><span className="perf-value">{stats.joiningsMtd}</span><span className="perf-label">Joinings MTD</span></div>
            </div>
          </div>
        )}

        {isOrgAdmin && (
          <p className="text-muted"><Link to="/settings">← All settings</Link></p>
        )}
      </div>
    </>
  );
}
