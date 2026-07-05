import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { Company } from '../types';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', industry: '', location: '' });

  const load = () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    api.getCompanies(params).then(setCompanies);
  };

  useEffect(() => {
    load();
  }, [search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createCompany(form);
    setShowAdd(false);
    setForm({ name: '', industry: '', location: '' });
    load();
  };

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'People', href: '/companies' }, { label: 'Companies' }]} />
      <div className="page-content">
        <PageHeader
          title="Company Management"
          description="Client and company registry for your staffing operations."
          actions={
            <button type="button" className="button-pill button-primary" onClick={() => setShowAdd(true)}>
              + Add Company
            </button>
          }
        />

        <div className="filter-bar">
          <input
            className="input-field"
            placeholder="Search companies…"
            style={{ maxWidth: 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input-field filter-select"><option>Active</option><option>All</option></select>
        </div>

        {showAdd && (
          <form className="card form-card" onSubmit={handleAdd} style={{ marginBottom: '1rem' }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Company name</label>
                <input className="input-field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Industry</label>
                <input className="input-field" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="input-field" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="button-pill button-primary">Save Company</button>
            </div>
          </form>
        )}

        <div className="company-grid">
          {companies.map((co) => (
            <div key={co.id} className="card company-card">
              <div className="company-card-header">
                <h3>{co.name}</h3>
                <span className="status-badge" style={{ '--badge-color': '#16A34A' } as React.CSSProperties}>
                  <span className="status-dot" /> {co.status}
                </span>
              </div>
              <p className="text-muted">{co.industry} · {co.location}</p>
              <div className="company-meta">
                <span>{co.open_jobs ?? 0} open jobs</span>
                <span>HM: {co.hiring_manager || '—'}</span>
              </div>
              <Link to="/jobs" className="button-pill button-secondary btn-sm">View jobs →</Link>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
