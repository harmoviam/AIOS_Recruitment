import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { showToast } from '../../utils/toast';
import type { RecommendationResult, SourcingCity, SourcingNamed, SourcingRole } from '../../types/sourcing';
import { PlanSummaryCards, RecommendationsTable } from './components';

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
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [searching, setSearching] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
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
        if (r.items[0]) setRoleId(r.items[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMasters(false));
  }, []);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
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
      setSearching(false);
    }
  }

  async function createCampaign() {
    if (!result) return;
    setCreatingCampaign(true);
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
      showToast('Campaign created with the top 5 sources', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create campaign', 'error');
    } finally {
      setCreatingCampaign(false);
    }
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">Find Best Sources</div></div>
      <div className="page-content">
        <h1 className="section-title">Find Best Sources</h1>
        <p className="section-description">
          Set your hiring criteria to get ranked sourcing channels with funnel estimates and risk levels.
        </p>

        <form className="card" onSubmit={onSearch}>
          <div
            style={{
              display: 'grid',
              gap: '0.9rem 1.1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <div>
              <label className="form-label" htmlFor="src-city">City</label>
              <select
                id="src-city"
                className="form-input"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                required
                disabled={loadingMasters}
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="src-role">Role</label>
              <select
                id="src-role"
                className="form-input"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
                disabled={loadingMasters}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="src-exp">Experience</label>
              <select
                id="src-exp"
                className="form-input"
                value={experienceLevelId}
                onChange={(e) => setExperienceLevelId(e.target.value)}
              >
                <option value="">Any</option>
                {experience.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="src-count">Hiring count</label>
              <input
                id="src-count"
                className="form-input"
                type="number"
                min={1}
                value={hiringCount}
                onChange={(e) => setHiringCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="src-timeline">Joining timeline (days)</label>
              <input
                id="src-timeline"
                className="form-input"
                type="number"
                min={1}
                value={joiningTimelineDays}
                onChange={(e) => setJoiningTimelineDays(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="src-salary">Max salary</label>
              <input
                id="src-salary"
                className="form-input"
                type="number"
                min={0}
                value={salaryMax}
                onChange={(e) => setSalaryMax(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="src-shift">Shift</label>
              <select id="src-shift" className="form-input" value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="DAY">Day</option>
                <option value="NIGHT">Night</option>
                <option value="ROTATIONAL">Rotational</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="src-lang">Language</label>
              <input
                id="src-lang"
                className="form-input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1.1rem' }}>
            <button
              className="button-pill button-primary"
              type="submit"
              disabled={searching || loadingMasters || !cityId || !roleId}
            >
              {searching ? 'Finding sources…' : 'Find Best Sources'}
            </button>
            <button type="button" className="link-button" onClick={() => navigate('/sourcing/copilot')}>
              Describe it in plain language instead →
            </button>
          </div>
        </form>

        {error && <div className="alert-banner danger" style={{ marginTop: '1rem' }}>{error}</div>}

        {result && (
          <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
            <PlanSummaryCards summary={result.planSummary} />
            <RecommendationsTable recommendations={result.recommendations} />
            {result.recommendations.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="button-pill button-primary"
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
                  Generate content for this plan
                </button>
                <button
                  type="button"
                  className="button-pill button-secondary"
                  onClick={createCampaign}
                  disabled={creatingCampaign}
                >
                  {creatingCampaign ? 'Creating…' : 'Create campaign (top 5 sources)'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
