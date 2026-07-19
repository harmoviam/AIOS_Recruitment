import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import type { ContentPack } from '../../types/sourcing';

export default function SourcingContentStudioPage() {
  const location = useLocation();
  const preset = (location.state || {}) as {
    cityName?: string;
    roleName?: string;
    hiringCount?: number;
    salaryMax?: number;
    sourceName?: string;
  };

  const [cityName, setCityName] = useState(preset.cityName || 'Mohali');
  const [roleName, setRoleName] = useState(preset.roleName || 'International Voice Process');
  const [hiringCount, setHiringCount] = useState(preset.hiringCount || 50);
  const [salaryMax, setSalaryMax] = useState(preset.salaryMax || 25000);
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [tab, setTab] = useState('FACEBOOK');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const active = useMemo(() => pack?.items.find((i) => i.channel === tab) || pack?.items[0], [pack, tab]);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const data = await api.sourcingGenerateContent({
        cityName,
        roleName,
        hiringCount,
        salaryMax,
        experienceLabel: 'Fresher',
        sourceName: preset.sourceName,
        languages: ['English'],
      });
      setPack(data);
      setTab(data.items[0]?.channel || 'FACEBOOK');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">Content Studio</div></div>
      <div className="page-content">
        <h1 className="section-title">Content Studio</h1>
        <p className="section-description">Template-based posts and scripts (no external AI).</p>

        <div className="card" style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
          <label>City<input value={cityName} onChange={(e) => setCityName(e.target.value)} /></label>
          <label>Role<input value={roleName} onChange={(e) => setRoleName(e.target.value)} /></label>
          <label>Hiring count<input type="number" value={hiringCount} onChange={(e) => setHiringCount(Number(e.target.value))} /></label>
          <label>Salary max<input type="number" value={salaryMax} onChange={(e) => setSalaryMax(Number(e.target.value))} /></label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary" type="button" onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate content pack'}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}

        {pack && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
              {pack.items.map((item) => (
                <button
                  key={item.channel}
                  type="button"
                  className={`btn ${tab === item.channel ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTab(item.channel)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            {active && (
              <>
                <textarea rows={12} value={active.body} readOnly style={{ width: '100%' }} />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => navigator.clipboard.writeText(active.body)}
                >
                  Copy
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
