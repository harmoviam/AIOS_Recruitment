import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { RecommendationResult, SourcingCity, SourcingNamed, SourcingRole } from '../../types/sourcing';

export default function SourcingSearchPage() {
  const navigate = useNavigate();
  const [cities, setCities] = useState<SourcingCity[]>([]);
  const [roles, setRoles] = useState<SourcingRole[]>([]);
  const [experience, setExperience] = useState<SourcingNamed[]>([]);
  const [cityId, setCityId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [experienceLevelId, setExperienceLevelId] = useState('');
  const [hiringCount, setHiringCount] = useState(50);
  const [joiningTimelineDays, setJoiningTimelineDays] = useState(5);
  const [salaryMax, setSalaryMax] = useState(25000);
  const [shift, setShift] = useState('NIGHT');
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecommendationResult | null>(null);

  useEffect(() => {
    Promise.all([
      api.sourcingListCities({ pageSize: '100', status: 'ACTIVE' }),
      api.sourcingListRoles({ pageSize: '100', status: 'ACTIVE' }),
      api.sourcingListExperienceLevels(),
    ])
      .then(([c, r, e]) => {
        setCities(c.items);
        setRoles(r.items);
        setExperience(e.items);
        if (c.items[0]) setCityId(c.items[0].id);
        const voice = r.items.find((x) => /voice/i.test(x.name)) || r.items[0];
        if (voice) setRoleId(voice.id);
        const fresher = e.items.find((x) => /fresher/i.test(x.name)) || e.items[0];
        if (fresher) setExperienceLevelId(fresher.id);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.sourcingSearch({
        cityId,
        roleId,
        experienceLevelId: experienceLevelId || undefined,
        hiringCount,
        joiningTimelineDays,
        salaryMax,
        shift,
        languages: language ? [language] : undefined,
        limit: 20,
      });
      setResult(data);
      sessionStorage.setItem('sourcing_last_result', JSON.stringify(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="search-bar">Sourcing — Find Best Sources</div>
      </div>
      <div className="page-content">
        <h1 className="section-title">Find Best Sources</h1>
        <p className="section-description">
          Enter hiring need to get ranked channels, funnel estimates, and risk — rule-based Recruiter Copilot.
        </p>

        <form className="card" onSubmit={onSearch} style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <label>
            City
            <select value={cityId} onChange={(e) => setCityId(e.target.value)} required>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Role
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label>
            Experience
            <select value={experienceLevelId} onChange={(e) => setExperienceLevelId(e.target.value)}>
              <option value="">Any</option>
              {experience.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </label>
          <label>
            Hiring count
            <input type="number" min={1} value={hiringCount} onChange={(e) => setHiringCount(Number(e.target.value))} />
          </label>
          <label>
            Joining timeline (days)
            <input type="number" min={1} value={joiningTimelineDays} onChange={(e) => setJoiningTimelineDays(Number(e.target.value))} />
          </label>
          <label>
            Max salary
            <input type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(Number(e.target.value))} />
          </label>
          <label>
            Shift
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="DAY">Day</option>
              <option value="NIGHT">Night</option>
              <option value="ROTATIONAL">Rotational</option>
            </select>
          </label>
          <label>
            Language
            <input value={language} onChange={(e) => setLanguage(e.target.value)} />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary" type="submit" disabled={loading || !cityId || !roleId}>
              {loading ? 'Finding…' : 'Find Best Sources'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => navigate('/sourcing/copilot')}>
              Use Copilot instead
            </button>
          </div>
        </form>

        {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}

        {result && (
          <div style={{ marginTop: '1.5rem' }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <div className="card"><div className="card-title">Est. Applications</div><div className="card-value">{result.planSummary.expectedApplications}</div></div>
              <div className="card"><div className="card-title">Est. Interviews</div><div className="card-value">{result.planSummary.expectedInterviews}</div></div>
              <div className="card"><div className="card-title">Est. Joinings</div><div className="card-value">{result.planSummary.expectedJoinings}</div></div>
              <div className="card"><div className="card-title">Overall Risk</div><div className="card-value">{result.planSummary.overallRisk}</div></div>
            </div>

            <div className="card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
              <div className="card-title">Top {result.recommendations.length} Sources</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>P</th>
                    <th>Source</th>
                    <th>Conf</th>
                    <th>Apps</th>
                    <th>Int</th>
                    <th>Join</th>
                    <th>Risk</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.recommendations.map((r) => (
                    <tr key={r.sourceId}>
                      <td>{r.priority}</td>
                      <td>{r.sourceName}</td>
                      <td>{r.confidenceScore}</td>
                      <td>{r.expectedApplications}</td>
                      <td>{r.expectedInterviews}</td>
                      <td>{r.expectedJoinings}</td>
                      <td>{r.risk}</td>
                      <td style={{ maxWidth: 280, fontSize: 12 }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    navigate('/sourcing/content', {
                      state: {
                        cityName: cities.find((c) => c.id === cityId)?.name,
                        roleName: roles.find((r) => r.id === roleId)?.name,
                        hiringCount,
                        salaryMax,
                        sourceName: result.recommendations[0]?.sourceName,
                      },
                    })
                  }
                >
                  Generate Content
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    try {
                      await api.sourcingCreateCampaign({
                        cityId,
                        roleId,
                        experienceLevelId: experienceLevelId || null,
                        name: `Sourcing — ${roles.find((r) => r.id === roleId)?.name || 'Role'} — ${cities.find((c) => c.id === cityId)?.name || 'City'}`,
                        hiringCount,
                        joiningTimelineDays,
                        salaryMax,
                        shiftType: shift,
                        sourceIds: result.recommendations.slice(0, 5).map((r, i) => ({
                          sourceId: r.sourceId,
                          priority: i + 1,
                        })),
                      });
                      alert('Campaign created');
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Failed');
                    }
                  }}
                >
                  Create Campaign (Top 5)
                </button>
              </div>
            </div>
            <div className="card" style={{ marginTop: '1rem', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #888)' }}>
              Map placeholder — source pins (lat/long) coming in a later maps sprint
            </div>
          </div>
        )}
      </div>
    </>
  );
}
