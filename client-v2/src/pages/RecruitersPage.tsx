import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import SideDrawer from '../components/ui/SideDrawer';
import type { Company, HiringManager, RecruiterStat, TeamPerformance } from '../types';
import { showDemoCredentials } from '../utils/demoMode';

type DrawerMode = { type: 'add' } | { type: 'edit'; recruiter: RecruiterStat };

const emptyForm = { name: '', email: '', password: '', company_id: '', managed_by_id: '' };

export default function RecruitersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHm = user?.role === 'hiring_manager';
  const [searchParams, setSearchParams] = useSearchParams();
  const hmFilter = searchParams.get('hm') ? Number(searchParams.get('hm')) : undefined;

  const [stats, setStats] = useState<RecruiterStat[]>([]);
  const [team, setTeam] = useState<TeamPerformance | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [hiringManagers, setHiringManagers] = useState<HiringManager[]>([]);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.getRecruiterStats(isAdmin && hmFilter ? { hm_id: hmFilter } : undefined).then(setStats);
    if (isAdmin || isHm) {
      api.getTeamPerformance(isAdmin && hmFilter ? hmFilter : undefined).then(setTeam).catch(() => setTeam(null));
    }
  };

  useEffect(() => {
    load();
    if (isAdmin) {
      api.getCompanies().then(setCompanies);
      api.getHiringManagers().then(setHiringManagers);
    }
  }, [isAdmin, isHm, hmFilter]);

  const selectedHm = isAdmin && hmFilter ? hiringManagers.find((h) => h.id === hmFilter) : null;

  const openAdd = () => {
    setForm({
      name: '',
      email: '',
      password: showDemoCredentials ? 'password123' : '',
      company_id: selectedHm?.company_id ? String(selectedHm.company_id) : '',
      managed_by_id: selectedHm ? String(selectedHm.id) : '',
    });
    setError('');
    setDrawer({ type: 'add' });
  };

  const openEdit = (recruiter: RecruiterStat) => {
    setForm({
      name: recruiter.name,
      email: recruiter.email,
      password: '',
      company_id: recruiter.company_id ? String(recruiter.company_id) : '',
      managed_by_id: recruiter.managed_by_id ? String(recruiter.managed_by_id) : '',
    });
    setError('');
    setDrawer({ type: 'edit', recruiter });
  };

  const closeDrawer = () => {
    setDrawer(null);
    setError('');
  };

  const onCompanyChange = (companyId: string) => {
    const hm = hiringManagers.find((h) => h.company_id === Number(companyId));
    setForm((f) => ({
      ...f,
      company_id: companyId,
      managed_by_id: hm ? String(hm.id) : f.managed_by_id,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawer) return;

    setSaving(true);
    setError('');
    try {
      const companyId = form.company_id ? Number(form.company_id) : undefined;
      const managedById = form.managed_by_id ? Number(form.managed_by_id) : undefined;

      if (drawer.type === 'add') {
        if (!form.password) {
          setError('Password is required');
          return;
        }
        await api.createRecruiter({
          name: form.name,
          email: form.email,
          password: form.password,
          company_id: companyId,
          managed_by_id: isAdmin ? managedById : undefined,
        });
      } else {
        const data: {
          name: string;
          password?: string;
          company_id?: number | null;
          managed_by_id?: number | null;
        } = { name: form.name };
        if (form.password) data.password = form.password;
        if (isAdmin) {
          data.company_id = companyId ?? null;
          data.managed_by_id = managedById ?? null;
        }
        await api.updateRecruiter(drawer.recruiter.id, data);
      }
      closeDrawer();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const filtered = stats.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  const isAdd = drawer?.type === 'add';
  const pageTitle = isHm ? 'My Recruiters' : 'Recruiter Management';
  const pageDesc = isHm
    ? 'Add and manage recruiters on your team. New recruiters are linked to your company automatically.'
    : isAdmin && selectedHm
      ? `Managing recruiters for ${selectedHm.name} (${selectedHm.company}). Org Admin has full HM-level access here.`
      : 'Manage all recruiters, assign hiring managers, and monitor team performance across the organization.';

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'People', href: '/recruiters' }, { label: pageTitle }]} />
      <div className="page-content">
        <PageHeader
          title={pageTitle}
          description={pageDesc}
          actions={
            <button type="button" className="button-pill button-primary" onClick={openAdd}>
              + Add Recruiter
            </button>
          }
        />

        {isAdmin && (
          <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <select
              className="input-field"
              style={{ maxWidth: 280 }}
              value={hmFilter ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setSearchParams({ hm: v });
                else setSearchParams({});
              }}
            >
              <option value="">All recruiters (org-wide)</option>
              {hiringManagers.map((hm) => (
                <option key={hm.id} value={hm.id}>
                  {hm.name} — {hm.company}
                </option>
              ))}
            </select>
            {selectedHm && (
              <Link to="/hiring-managers" className="button-pill button-secondary btn-sm">
                ← Back to HMs
              </Link>
            )}
          </div>
        )}

        {(isHm || (isAdmin && hmFilter && team)) && team && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 className="card-heading">
              {isAdmin && selectedHm ? `Team Performance — ${selectedHm.name}` : 'My Team Performance'}
            </h3>
            <div className="perf-stats">
              <div><span className="perf-value">{team.recruiters.length}</span><span className="perf-label">Recruiters</span></div>
              <div><span className="perf-value">{team.team.candidates}</span><span className="perf-label">Candidates</span></div>
              <div><span className="perf-value">{team.team.joiningsMtd}</span><span className="perf-label">Joinings MTD</span></div>
              <div><span className="perf-value">{team.team.pendingFollowups}</span><span className="perf-label">Open Follow-ups</span></div>
            </div>
          </div>
        )}

        <div className="filter-bar">
          <input
            className="input-field"
            placeholder="Search recruiters…"
            style={{ maxWidth: 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="table-wrap card flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                {isAdmin && <th>Company</th>}
                {isAdmin && <th>Hiring Manager</th>}
                <th>Active Jobs</th>
                <th>Candidates</th>
                <th>Joinings MTD</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.email}</td>
                  {isAdmin && <td>{s.company || '—'}</td>}
                  {isAdmin && <td>{s.hiringManager || '—'}</td>}
                  <td>{s.activeJobs}</td>
                  <td>{s.candidates}</td>
                  <td>{s.joiningsMtd}</td>
                  <td><span className="status-dot-inline active" /> {s.status}</td>
                  <td>
                    <button type="button" className="button-pill button-secondary btn-sm" onClick={() => openEdit(s)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="empty-inline">
              {isHm
                ? 'No recruiters on your team yet. Click Add Recruiter to invite one.'
                : isAdmin && hmFilter
                  ? 'No recruiters assigned to this hiring manager yet.'
                  : 'No recruiters found.'}
            </p>
          )}
        </div>

        {isAdmin && !hmFilter && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 className="card-heading">Manage by Hiring Manager</h3>
            <p className="text-muted" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              Org Admin can do everything a Hiring Manager can — view teams, add recruiters, and track performance per HM.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {hiringManagers.map((hm) => (
                <Link key={hm.id} to={`/recruiters?hm=${hm.id}`} className="button-pill button-secondary btn-sm">
                  {hm.name} ({hm.recruiterCount} recruiters)
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <SideDrawer
        open={!!drawer}
        onClose={closeDrawer}
        title={isAdd ? 'Add Recruiter' : 'Edit Recruiter'}
        footer={
          <div className="form-actions" style={{ margin: 0 }}>
            <button type="button" className="button-pill button-secondary" onClick={closeDrawer} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="recruiter-form" className="button-pill button-primary" disabled={saving}>
              {saving ? 'Saving…' : isAdd ? 'Create Recruiter' : 'Save Changes'}
            </button>
          </div>
        }
      >
        <form id="recruiter-form" onSubmit={handleSave}>
          {error && <p className="text-critical" style={{ marginBottom: '1rem' }}>{error}</p>}
          {isHm && isAdd && (
            <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
              This recruiter will be linked to your company and report to you automatically.
            </p>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="recruiter-name">Full name</label>
            <input
              id="recruiter-name"
              className="input-field"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label" htmlFor="recruiter-email">Email</label>
            <input
              id="recruiter-email"
              className="input-field"
              type="email"
              required
              readOnly={!isAdd}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          {isAdmin && (
            <>
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label className="form-label" htmlFor="recruiter-company">Company</label>
                <select
                  id="recruiter-company"
                  className="input-field"
                  value={form.company_id}
                  onChange={(e) => onCompanyChange(e.target.value)}
                >
                  <option value="">— Org-wide (no company) —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label className="form-label" htmlFor="recruiter-hm">Hiring Manager</label>
                <select
                  id="recruiter-hm"
                  className="input-field"
                  value={form.managed_by_id}
                  onChange={(e) => setForm({ ...form, managed_by_id: e.target.value })}
                >
                  <option value="">— Unassigned —</option>
                  {hiringManagers.map((hm) => (
                    <option key={hm.id} value={hm.id}>{hm.name} ({hm.company})</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label" htmlFor="recruiter-password">
              {isAdd ? 'Password' : 'New password (optional)'}
            </label>
            <input
              id="recruiter-password"
              className="input-field"
              type="password"
              required={isAdd}
              minLength={8}
              placeholder={isAdd ? '' : 'Leave blank to keep current'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </form>
      </SideDrawer>
    </>
  );
}
