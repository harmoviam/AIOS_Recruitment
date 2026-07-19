import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { showToast } from '../../utils/toast';
import type { SourcingSource } from '../../types/sourcing';
import { channelLabel } from './components';

export default function SourcingSourcesPage() {
  const [items, setItems] = useState<SourcingSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [apps, setApps] = useState(10);
  const [interviews, setInterviews] = useState(4);
  const [joinings, setJoinings] = useState(1);
  const [saving, setSaving] = useState(false);

  function reload() {
    return api
      .sourcingListSources({ pageSize: '50', status: 'ACTIVE' })
      .then((r) => {
        setItems(r.items);
        setSourceId((prev) => prev || r.items[0]?.id || '');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function saveActivity() {
    setSaving(true);
    try {
      await api.sourcingLogActivity({
        sourceId,
        applications: apps,
        interviews,
        joinings,
        offers: joinings,
      });
      showToast('Activity logged — source scores updated', 'success');
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not log activity', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">Sourcing Channels</div></div>
      <div className="page-content">
        <h1 className="section-title">Sourcing Channels</h1>
        <p className="section-description">
          The channels available to your organization. Log real outcomes below so recommendations keep improving.
        </p>
        {error && <div className="alert-banner danger">{error}</div>}

        <div className="card table-wrap">
          {loading ? (
            <p className="empty-inline">Loading channels…</p>
          ) : items.length === 0 ? (
            <p className="empty-inline">No active sourcing channels yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Channel type</th><th>Quality rating</th></tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>
                      <span className="status-badge">{channelLabel(s.channelType)}</span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {s.qualityRating != null ? `${s.qualityRating}/10` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ marginTop: '1.25rem' }}>
          <div className="card-title">Log recruiter activity</div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Record how a channel actually performed. These numbers train the learning engine that ranks sources.
          </p>
          <div
            style={{
              display: 'grid',
              gap: '0.9rem 1.1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            }}
          >
            <div>
              <label className="form-label" htmlFor="act-source">Source</label>
              <select
                id="act-source"
                className="form-input"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {items.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="act-apps">Applications</label>
              <input
                id="act-apps"
                className="form-input"
                type="number"
                min={0}
                value={apps}
                onChange={(e) => setApps(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="act-interviews">Interviews</label>
              <input
                id="act-interviews"
                className="form-input"
                type="number"
                min={0}
                value={interviews}
                onChange={(e) => setInterviews(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="act-joinings">Joinings</label>
              <input
                id="act-joinings"
                className="form-input"
                type="number"
                min={0}
                value={joinings}
                onChange={(e) => setJoinings(Number(e.target.value))}
              />
            </div>
          </div>
          <div style={{ marginTop: '1.1rem' }}>
            <button
              type="button"
              className="button-pill button-primary"
              onClick={saveActivity}
              disabled={saving || !sourceId}
            >
              {saving ? 'Saving…' : 'Save activity'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
