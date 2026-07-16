import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import JobLocationPicker, { type JobLocationValue } from '../components/JobLocationPicker';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { Company } from '../types';

type CompanyForm = {
  name: string;
  industry: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

const emptyForm = (): CompanyForm => ({
  name: '',
  industry: '',
  location: '',
  latitude: null,
  longitude: null,
  address: '',
  city: '',
  state: '',
  country: '',
  pincode: '',
});

function companyToForm(co: Company): CompanyForm {
  return {
    name: co.name,
    industry: co.industry || '',
    location: co.location || '',
    latitude: co.latitude ?? null,
    longitude: co.longitude ?? null,
    address: co.address || '',
    city: co.city || '',
    state: co.state || '',
    country: co.country || '',
    pincode: co.pincode || '',
  };
}

function formToPayload(form: CompanyForm): Partial<Company> {
  return {
    name: form.name,
    industry: form.industry || undefined,
    location: form.location || form.address || undefined,
    latitude: form.latitude,
    longitude: form.longitude,
    address: form.address || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    country: form.country || undefined,
    pincode: form.pincode || undefined,
  };
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    api.getCompanies(params).then(setCompanies);
  };

  useEffect(() => {
    load();
  }, [search]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setShowAdd(true);
  };

  const openEdit = (co: Company) => {
    setEditing(co);
    setForm(companyToForm(co));
    setError('');
    setShowAdd(true);
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditing(null);
    setForm(emptyForm());
    setError('');
  };

  const onLocationChange = (loc: JobLocationValue) => {
    setForm((prev) => ({
      ...prev,
      address: loc.address,
      latitude: loc.latitude,
      longitude: loc.longitude,
      city: loc.city,
      state: loc.state,
      country: loc.country,
      pincode: loc.pincode,
      location: loc.locationLabel || loc.address,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.address && (form.latitude == null || form.longitude == null)) {
      setError('Select a Google Maps place so the company can be ranked by distance.');
      return;
    }
    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editing) {
        await api.updateCompany(editing.id, payload);
      } else {
        await api.createCompany(payload);
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'People', href: '/companies' }, { label: 'Companies' }]} />
      <div className="page-content">
        <PageHeader
          title="Company Management"
          description="Client and company registry for your staffing operations. Pin each office on Google Maps to suggest nearby companies for candidates."
          actions={
            <button type="button" className="button-pill button-primary" onClick={openAdd}>
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
          <form className="card form-card" onSubmit={handleSave} style={{ marginBottom: '1rem' }}>
            <h3 className="card-heading" style={{ marginBottom: '0.75rem' }}>
              {editing ? `Edit ${editing.name}` : 'Add Company'}
            </h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Company name</label>
                <input
                  className="input-field"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Industry</label>
                <input
                  className="input-field"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>
            <JobLocationPicker
              label="Office location (Google Maps)"
              inputId="company-address"
              value={{
                address: form.address,
                latitude: form.latitude ?? undefined,
                longitude: form.longitude ?? undefined,
                city: form.city,
                state: form.state,
                country: form.country,
                pincode: form.pincode,
                locationLabel: form.location,
              }}
              onChange={onLocationChange}
              disabled={saving}
            />
            {error && <p className="form-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="button-pill button-primary" disabled={saving}>
                {editing ? 'Update Company' : 'Save Company'}
              </button>
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
              <p className="text-muted">{co.industry || '—'} · {co.location || co.address || 'No location'}</p>
              <div className="company-meta">
                <span>{co.open_jobs ?? 0} open jobs</span>
                <span>HM: {co.hiring_manager || '—'}</span>
                <span className={co.latitude != null && co.longitude != null ? 'geo-ready' : 'geo-missing'}>
                  {co.latitude != null && co.longitude != null ? 'Map pin set' : 'Needs map pin'}
                </span>
              </div>
              <div className="company-card-actions">
                <button type="button" className="button-pill button-secondary btn-sm" onClick={() => openEdit(co)}>
                  Edit location
                </button>
                <Link to="/jobs" className="button-pill button-secondary btn-sm">View jobs →</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
