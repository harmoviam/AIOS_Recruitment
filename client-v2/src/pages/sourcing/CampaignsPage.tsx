import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import { useTenant } from '../../context/TenantContext';
import { showToast } from '../../utils/toast';
import type {
  SourcingCampaign,
  SourcingCampaignDetail,
  SourcingCity,
  SourcingRole,
  SourcingSource,
} from '../../types/sourcing';
import { channelLabel } from './components';

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'var(--success)',
  INACTIVE: 'var(--warning)',
  COMPLETED: 'var(--primary)',
  ARCHIVED: 'var(--text-secondary)',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="status-badge"
      style={{ '--badge-color': STATUS_COLORS[status] ?? 'var(--text-secondary)' } as CSSProperties}
    >
      <span className="status-dot" />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export default function SourcingCampaignsPage() {
  const { tenant } = useTenant();
  const [campaigns, setCampaigns] = useState<SourcingCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<SourcingCampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cities, setCities] = useState<SourcingCity[]>([]);
  const [roles, setRoles] = useState<SourcingRole[]>([]);
  const [allSources, setAllSources] = useState<SourcingSource[]>([]);

  const [attachSourceId, setAttachSourceId] = useState('');
  const [attachPriority, setAttachPriority] = useState('');
  const [attachTarget, setAttachTarget] = useState('');

  const cityName = useMemo(() => {
    const m = new Map(cities.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [cities]);
  const roleName = useMemo(() => {
    const m = new Map(roles.map((r) => [r.id, r.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [roles]);

  useEffect(() => {
    api.sourcingListCities({ pageSize: '200' }).then((r) => setCities(r.items)).catch(() => {});
    api.sourcingListRoles({ pageSize: '200' }).then((r) => setRoles(r.items)).catch(() => {});
    api.sourcingListSources({ pageSize: '200' }).then((r) => setAllSources(r.items)).catch(() => {});
  }, []);

  async function loadCampaigns() {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { pageSize: '50' };
      if (statusFilter) params.status = statusFilter;
      if (query.trim()) params.q = query.trim();
      const page = await api.sourcingListCampaigns(params);
      setCampaigns(page.items);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function openCampaign(id: string) {
    setDetailLoading(true);
    setAttachSourceId('');
    setAttachPriority('');
    setAttachTarget('');
    try {
      setSelected(await api.sourcingCampaign(id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load campaign', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(status: string) {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api.sourcingUpdateCampaign(selected.id, { status });
      setSelected(updated);
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? { ...c, status: updated.status } : c)));
      showToast('Campaign status updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update campaign', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function attachSource() {
    if (!selected || !attachSourceId) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { sourceId: attachSourceId };
      if (attachPriority.trim()) body.priority = Number(attachPriority);
      if (attachTarget.trim()) body.allocatedTarget = Number(attachTarget);
      const updated = await api.sourcingAttachCampaignSource(selected.id, body);
      setSelected(updated);
      setAttachSourceId('');
      setAttachPriority('');
      setAttachTarget('');
      showToast('Source attached', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not attach source', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function publishToCareers() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await api.sourcingPublishCampaign(selected.id);
      setSelected({ ...selected, publishedJob: res.job });
      showToast(
        res.created ? 'Published to your careers page' : 'Already published — showing existing posting',
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not publish campaign', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function detachSource(sourceId: string) {
    if (!selected) return;
    setSaving(true);
    try {
      await api.sourcingDetachCampaignSource(selected.id, sourceId);
      setSelected({
        ...selected,
        sources: selected.sources.filter((s) => s.sourceId !== sourceId),
      });
      showToast('Source removed', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove source', 'error');
    } finally {
      setSaving(false);
    }
  }

  const attachableSources = useMemo(() => {
    if (!selected) return [];
    const attached = new Set(selected.sources.map((s) => s.sourceId));
    return allSources.filter((s) => !attached.has(s.id));
  }, [selected, allSources]);

  return (
    <>
      <div className="topbar"><div className="search-bar">Campaigns</div></div>
      <div className="page-content">
        <h1 className="section-title">Campaigns</h1>
        <p className="section-description">
          All sourcing campaigns in your workspace. Create new campaigns from Find Sources; manage their
          status and attached channels here.
        </p>

        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ maxWidth: 280 }}
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadCampaigns()}
          />
          <select
            className="form-input"
            style={{ maxWidth: 180 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <button className="button-pill button-secondary" type="button" onClick={loadCampaigns} disabled={loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {total} campaign{total === 1 ? '' : 's'}
          </span>
        </div>

        {error && <div className="alert-banner danger" style={{ marginTop: '1rem' }}>{error}</div>}

        <div className="card table-wrap" style={{ marginTop: '1rem' }}>
          {campaigns.length === 0 && !loading ? (
            <p className="empty-inline">
              No campaigns yet. Run a search in Find Sources and use “Create campaign (top 5 sources)”.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Role</th>
                  <th>City</th>
                  <th>Headcount</th>
                  <th>Timeline</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} style={selected?.id === c.id ? { background: 'var(--surface-2)' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{roleName(c.roleId)}</td>
                    <td>{cityName(c.cityId)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.hiringCount}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {c.joiningTimelineDays != null ? `${c.joiningTimelineDays} days` : '—'}
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {new Date(c.createdDate).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button-pill button-secondary btn-sm"
                        onClick={() => openCampaign(c.id)}
                        disabled={detailLoading}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {detailLoading && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p className="empty-inline">Loading campaign…</p>
          </div>
        )}

        {!detailLoading && selected && (
          <div className="card" style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
              <div>
                <div className="card-title" style={{ marginBottom: '0.15rem' }}>{selected.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {roleName(selected.roleId)} · {cityName(selected.cityId)} · {selected.hiringCount} hires
                  {selected.joiningTimelineDays != null ? ` · ${selected.joiningTimelineDays} days` : ''}
                  {selected.salaryMax != null ? ` · up to ₹${selected.salaryMax.toLocaleString()}` : ''}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Status</label>
                <select
                  className="form-input"
                  style={{ maxWidth: 160 }}
                  value={selected.status}
                  onChange={(e) => changeStatus(e.target.value)}
                  disabled={saving}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
            </div>

            {selected.notes && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selected.notes}</p>
            )}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.6rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                background: 'var(--surface-2)',
              }}
            >
              {selected.publishedJob ? (
                <>
                  <span style={{ fontSize: '0.85rem' }}>
                    Published on your careers page as <strong>{selected.publishedJob.title}</strong>
                    {selected.publishedJob.status !== 'active' && (
                      <span style={{ color: 'var(--warning)' }}> (job {selected.publishedJob.status})</span>
                    )}
                  </span>
                  <a
                    href={`/careers/${tenant.slug}/jobs/${selected.publishedJob.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-button"
                    style={{ marginLeft: 'auto' }}
                  >
                    Open public posting ↗
                  </a>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Not on your public careers page yet. Publishing creates a job posting candidates can
                    apply to — applications track back to this campaign.
                  </span>
                  <button
                    type="button"
                    className="button-pill button-primary btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={publishToCareers}
                    disabled={saving}
                  >
                    {saving ? 'Publishing…' : 'Publish to careers page'}
                  </button>
                </>
              )}
            </div>

            <div className="table-wrap">
              <div className="card-title">Attached sources ({selected.sources.length})</div>
              {selected.sources.length === 0 ? (
                <p className="empty-inline">No sources attached yet — add one below.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>#</th>
                      <th>Source</th>
                      <th>Channel</th>
                      <th>Allocated target</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.sources.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{s.priority}</td>
                        <td style={{ fontWeight: 600 }}>{s.sourceName}</td>
                        <td style={{ fontSize: '0.82rem' }}>{channelLabel(s.channelType)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.allocatedTarget ?? '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="button-pill button-secondary btn-sm"
                            onClick={() => detachSource(s.sourceId)}
                            disabled={saving}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
              <div style={{ minWidth: 220 }}>
                <label className="form-label" htmlFor="attach-source">Add source</label>
                <select
                  id="attach-source"
                  className="form-input"
                  value={attachSourceId}
                  onChange={(e) => setAttachSourceId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Select a source…</option>
                  {attachableSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({channelLabel(s.channelType)})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ width: 110 }}>
                <label className="form-label" htmlFor="attach-priority">Priority</label>
                <input
                  id="attach-priority"
                  className="form-input"
                  type="number"
                  min={1}
                  placeholder="e.g. 1"
                  value={attachPriority}
                  onChange={(e) => setAttachPriority(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div style={{ width: 130 }}>
                <label className="form-label" htmlFor="attach-target">Target hires</label>
                <input
                  id="attach-target"
                  className="form-input"
                  type="number"
                  min={0}
                  placeholder="optional"
                  value={attachTarget}
                  onChange={(e) => setAttachTarget(e.target.value)}
                  disabled={saving}
                />
              </div>
              <button
                type="button"
                className="button-pill button-primary"
                onClick={attachSource}
                disabled={saving || !attachSourceId}
              >
                {saving ? 'Saving…' : 'Attach source'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
