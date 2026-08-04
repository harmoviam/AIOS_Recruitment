import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useTenant } from '../context/TenantContext';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import SideDrawer from '../components/ui/SideDrawer';
import type { Company, HiringManager } from '../types';
import { tenantLoginUrl } from '../utils/tenantUrl';
import { showDemoCredentials } from '../utils/demoMode';

const defaultHmPassword = () => (showDemoCredentials ? 'password123' : '');

type EditForm = { name: string; company_id: string };

export default function HiringManagersPage() {
  const { tenant } = useTenant();
  const loginUrl = tenantLoginUrl(tenant.slug);
  const [managers, setManagers] = useState<HiringManager[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: defaultHmPassword(), company_id: '' });
  const [editHm, setEditHm] = useState<HiringManager | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', company_id: '' });
  const [loginHm, setLoginHm] = useState<HiringManager | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [createdLogin, setCreatedLogin] = useState<{ name: string; email: string; password: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editError, setEditError] = useState('');

  const load = () => api.getHiringManagers().then(setManagers);

  useEffect(() => {
    load();
    api.getCompanies().then(setCompanies);
  }, []);

  const openEdit = (hm: HiringManager) => {
    setEditHm(hm);
    setEditForm({
      name: hm.name,
      company_id: hm.company_id ? String(hm.company_id) : '',
    });
    setEditError('');
  };

  const closeEdit = () => {
    setEditHm(null);
    setEditError('');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createHiringManager({
        ...form,
        company_id: form.company_id ? Number(form.company_id) : undefined,
      });
      setCreatedLogin({ name: form.name, email: form.email, password: form.password });
      setShowAdd(false);
      setForm({ name: '', email: '', password: defaultHmPassword(), company_id: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create hiring manager');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHm) return;
    setSaving(true);
    setEditError('');
    try {
      await api.updateHiringManager(editHm.id, {
        name: editForm.name.trim(),
        company_id: editForm.company_id ? Number(editForm.company_id) : null,
      });
      closeEdit();
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update hiring manager');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!loginHm || !resetPassword) return;
    setSaving(true);
    try {
      await api.updateHiringManager(loginHm.id, { password: resetPassword });
      setResetPassword('');
      alert(`Password updated for ${loginHm.email}. Share the new password with the hiring manager.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const loginInstructions = (hm: HiringManager) => (
    <div className="login-details-card">
      <p className="text-muted" style={{ marginBottom: '1rem' }}>
        Share these details with <strong>{hm.name}</strong> so they can sign in and manage recruiters.
      </p>
      <div className="detail-row"><span className="detail-label">Organization</span><strong>{tenant.name}</strong></div>
      <div className="detail-row"><span className="detail-label">Workspace slug</span><code>{tenant.slug}</code></div>
      <div className="detail-row"><span className="detail-label">Login URL</span><a href={loginUrl} target="_blank" rel="noreferrer">{loginUrl}</a></div>
      <div className="detail-row"><span className="detail-label">Email</span><code>{hm.email}</code></div>
      <div className="detail-row"><span className="detail-label">Role</span><span>Hiring Manager</span></div>
      <div className="detail-row"><span className="detail-label">Company</span><span>{hm.company}</span></div>
      <div className="card flat" style={{ marginTop: '1rem', padding: '0.75rem' }}>
        <strong>How the HM logs in</strong>
        <ol style={{ margin: '0.5rem 0 0 1rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <li>Open <strong>{loginUrl}</strong></li>
          <li>Select organization <strong>{tenant.name}</strong> ({tenant.slug})</li>
          <li>Enter email <strong>{hm.email}</strong> and their password</li>
          <li>After login → <strong>My Recruiters</strong> to add/manage recruiters</li>
        </ol>
      </div>
      <div className="form-group" style={{ marginTop: '1rem' }}>
        <label className="form-label">Reset password (admin)</label>
        <input
          className="input-field"
          type="password"
          placeholder="New password (min 8 chars)"
          minLength={8}
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
        />
        <button
          type="button"
          className="button-pill button-secondary btn-sm"
          style={{ marginTop: '0.5rem' }}
          disabled={!resetPassword || saving}
          onClick={handleResetPassword}
        >
          Set new password
        </button>
      </div>
    </div>
  );

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'People', href: '/hiring-managers' }, { label: 'Hiring Managers' }]} />
      <div className="page-content">
        <PageHeader
          title="Hiring Manager Management"
          description="Organization Admin creates HMs and shares login details. Each HM manages recruiters for their company."
          actions={
            <button type="button" className="button-pill button-primary" onClick={() => setShowAdd(true)}>
              + Add Hiring Manager
            </button>
          }
        />

        {createdLogin && (
          <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--success)' }}>
            <h3 className="card-heading">Hiring Manager created — share login details</h3>
            <div className="detail-row"><span className="detail-label">Organization</span><strong>{tenant.name} ({tenant.slug})</strong></div>
            <div className="detail-row"><span className="detail-label">Email</span><code>{createdLogin.email}</code></div>
            <div className="detail-row"><span className="detail-label">Initial password</span><code>{createdLogin.password}</code></div>
            <div className="detail-row"><span className="detail-label">Login URL</span><span>{loginUrl}</span></div>
            <button type="button" className="button-pill button-secondary btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setCreatedLogin(null)}>
              Dismiss
            </button>
          </div>
        )}

        {showAdd && (
          <form className="card form-card" onSubmit={handleAdd} style={{ marginBottom: '1rem' }}>
            {error && <p className="text-critical">{error}</p>}
            {companies.length === 0 && (
              <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                No companies yet. You can create the HM now and assign a company later, or add one under{' '}
                <Link to="/companies">Companies</Link> first.
              </p>
            )}
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="input-field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email (HM login)</label>
                <input className="input-field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Initial password</label>
                <input className="input-field" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Company <span className="text-muted">(optional)</span></label>
                <select className="input-field" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                  <option value="">— No company —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="button-pill button-primary" disabled={saving}>{saving ? 'Creating…' : 'Create HM'}</button>
            </div>
          </form>
        )}

        <div className="table-wrap card flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login email</th>
                <th>Workspace</th>
                <th>Company</th>
                <th>Recruiters</th>
                <th>Team Joinings MTD</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {managers.map((hm) => (
                <tr key={hm.id}>
                  <td><strong>{hm.name}</strong></td>
                  <td><code>{hm.email}</code></td>
                  <td><code>{tenant.slug}</code></td>
                  <td>{hm.company}</td>
                  <td>{hm.recruiterCount}</td>
                  <td>{hm.teamJoiningsMtd}</td>
                  <td style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button type="button" className="button-pill button-secondary btn-sm" onClick={() => openEdit(hm)}>
                      Edit
                    </button>
                    <button type="button" className="button-pill button-primary btn-sm" onClick={() => { setLoginHm(hm); setResetPassword(''); }}>
                      Login details
                    </button>
                    <Link to={`/recruiters?hm=${hm.id}`} className="button-pill button-secondary btn-sm">Manage team</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showDemoCredentials && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 className="card-heading">Demo Hiring Manager (StaffPro)</h3>
            <div className="detail-row"><span className="detail-label">Organization</span><strong>StaffPro Agency (staffpro-agency)</strong></div>
            <div className="detail-row"><span className="detail-label">Email</span><code>anil.mehta@client.com</code></div>
            <div className="detail-row"><span className="detail-label">Password</span><code>password123</code></div>
            <div className="detail-row"><span className="detail-label">Company</span><span>TCS</span></div>
          </div>
        )}
      </div>

      <SideDrawer
        open={!!editHm}
        onClose={closeEdit}
        title={editHm ? `Edit — ${editHm.name}` : 'Edit Hiring Manager'}
        footer={
          <div className="form-actions" style={{ margin: 0 }}>
            <button type="button" className="button-pill button-secondary" onClick={closeEdit} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="hm-edit-form" className="button-pill button-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        }
      >
        <form id="hm-edit-form" onSubmit={handleEdit}>
          {editError && <p className="text-critical" style={{ marginBottom: '1rem' }}>{editError}</p>}
          {companies.length === 0 && (
            <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
              No companies yet. Create one under <Link to="/companies">Companies</Link> first, then assign it here.
            </p>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="hm-edit-name">Full name</label>
            <input
              id="hm-edit-name"
              className="input-field"
              name="name"
              autoComplete="name"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label" htmlFor="hm-edit-email">Login email</label>
            <input
              id="hm-edit-email"
              className="input-field"
              type="email"
              readOnly
              value={editHm?.email ?? ''}
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label" htmlFor="hm-edit-company">Company</label>
            <select
              id="hm-edit-company"
              className="input-field"
              value={editForm.company_id}
              onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })}
            >
              <option value="">— No company —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </form>
      </SideDrawer>

      <SideDrawer
        open={!!loginHm}
        onClose={() => setLoginHm(null)}
        title={loginHm ? `Login details — ${loginHm.name}` : ''}
      >
        {loginHm && loginInstructions(loginHm)}
      </SideDrawer>
    </>
  );
}
