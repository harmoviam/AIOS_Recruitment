import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import { showToast } from '../../utils/toast';
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

  const [cityName, setCityName] = useState(preset.cityName || '');
  const [roleName, setRoleName] = useState(preset.roleName || '');
  const [hiringCount, setHiringCount] = useState(preset.hiringCount || 50);
  const [salaryMax, setSalaryMax] = useState(preset.salaryMax || 25000);
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [tab, setTab] = useState('');
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
      setTab(data.items[0]?.channel || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate content');
    } finally {
      setLoading(false);
    }
  }

  function copyActive() {
    if (!active) return;
    navigator.clipboard
      .writeText(active.body)
      .then(() => showToast('Copied to clipboard', 'success'))
      .catch(() => showToast('Copy failed', 'error'));
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">Content Studio</div></div>
      <div className="page-content">
        <h1 className="section-title">Content Studio</h1>
        <p className="section-description">
          Generate ready-to-post job ads and outreach scripts for every channel — WhatsApp, Facebook, referral
          messages, and more.
        </p>

        <div className="card">
          <div
            style={{
              display: 'grid',
              gap: '0.9rem 1.1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            }}
          >
            <div>
              <label className="form-label" htmlFor="cs-city">City</label>
              <input
                id="cs-city"
                className="form-input"
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="e.g. Mohali"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="cs-role">Role</label>
              <input
                id="cs-role"
                className="form-input"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g. International Voice Process"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="cs-count">Hiring count</label>
              <input
                id="cs-count"
                className="form-input"
                type="number"
                min={1}
                value={hiringCount}
                onChange={(e) => setHiringCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="cs-salary">Max salary</label>
              <input
                id="cs-salary"
                className="form-input"
                type="number"
                min={0}
                value={salaryMax}
                onChange={(e) => setSalaryMax(Number(e.target.value))}
              />
            </div>
          </div>
          <div style={{ marginTop: '1.1rem' }}>
            <button
              className="button-pill button-primary"
              type="button"
              onClick={generate}
              disabled={loading || !cityName.trim() || !roleName.trim()}
            >
              {loading ? 'Generating…' : 'Generate content pack'}
            </button>
          </div>
        </div>

        {error && <div className="alert-banner danger" style={{ marginTop: '1rem' }}>{error}</div>}

        {pack && pack.items.length > 0 && (
          <div className="card" style={{ marginTop: '1.25rem' }}>
            <div className="tabs">
              {pack.items.map((item) => (
                <button
                  key={item.channel}
                  type="button"
                  className={`tab-item${(active?.channel === item.channel) ? ' active' : ''}`}
                  onClick={() => setTab(item.channel)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            {active && (
              <>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.88rem',
                    fontFamily: 'inherit',
                    margin: 0,
                    padding: '1rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    lineHeight: 1.55,
                  }}
                >
                  {active.body}
                </pre>
                <div style={{ marginTop: '0.85rem' }}>
                  <button type="button" className="button-pill button-secondary" onClick={copyActive}>
                    Copy to clipboard
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
