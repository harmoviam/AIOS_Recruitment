import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { SourcingSource } from '../../types/sourcing';

export default function SourcingSourcesPage() {
  const [items, setItems] = useState<SourcingSource[]>([]);
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [apps, setApps] = useState(10);
  const [interviews, setInterviews] = useState(4);
  const [joinings, setJoinings] = useState(1);

  function reload() {
    api
      .sourcingListSources({ pageSize: '50', status: 'ACTIVE' })
      .then((r) => {
        setItems(r.items);
        if (r.items[0]) setSourceId(r.items[0].id);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <>
      <div className="topbar"><div className="search-bar">Sourcing Channels</div></div>
      <div className="page-content">
        <h1 className="section-title">Sources</h1>
        <p className="section-description">Tenant sourcing channels. Log outcomes below to train the learning engine.</p>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Channel</th><th>Quality</th></tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.channelType}</td>
                  <td>{s.qualityRating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: '1rem', display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
          <div className="card-title" style={{ gridColumn: '1 / -1' }}>Log recruiter activity (Learning Engine)</div>
          <label>
            Source
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {items.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>Applications<input type="number" value={apps} onChange={(e) => setApps(Number(e.target.value))} /></label>
          <label>Interviews<input type="number" value={interviews} onChange={(e) => setInterviews(Number(e.target.value))} /></label>
          <label>Joinings<input type="number" value={joinings} onChange={(e) => setJoinings(Number(e.target.value))} /></label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await api.sourcingLogActivity({
                    sourceId,
                    applications: apps,
                    interviews,
                    joinings,
                    offers: joinings,
                  });
                  alert('Activity logged — source score updated');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed');
                }
              }}
            >
              Save activity
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
