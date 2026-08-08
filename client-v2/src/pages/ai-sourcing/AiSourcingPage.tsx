import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Job } from '../../types';
import type {
  AiSourcingCandidateHit,
  AiSourcingParseResult,
  AiSourcingRecentItem,
  AiSourcingRecommendedItem,
  CandidateSearchCriteria,
  FieldConfidence,
  JobIntelligence,
} from '../../types/aiSourcing';

const EXAMPLE_QUERY =
  'Find AWS Cloud Architects in Bangalore with healthcare experience, Terraform, Kubernetes, 10+ years experience, salary below 55 LPA and notice period below 30 days';

function emptyCriteria(): CandidateSearchCriteria {
  return {
    skills: [],
    preferredSkills: [],
    keywords: [],
    roles: [],
    industries: [],
    jobTitle: null,
    location: null,
    seniority: null,
    minExperienceYears: null,
    maxExperienceYears: null,
    noticePeriodMaxDays: null,
    maxSalaryLpa: null,
    stage: null,
    minAiScore: null,
  };
}

function skillsToText(skills: unknown): string {
  if (Array.isArray(skills)) return skills.map(String).join(', ');
  return '';
}

function formatConfidence(conf: FieldConfidence): string {
  const parts = Object.entries(conf)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`);
  return parts.length ? parts.join(' · ') : '—';
}

export default function AiSourcingPage() {
  const [query, setQuery] = useState(EXAMPLE_QUERY);
  const [criteria, setCriteria] = useState<CandidateSearchCriteria>(emptyCriteria());
  const [fieldConfidence, setFieldConfidence] = useState<FieldConfidence>({});
  const [parserMode, setParserMode] = useState<string>('');
  const [showCriteria, setShowCriteria] = useState(false);
  const [results, setResults] = useState<AiSourcingCandidateHit[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [expandedSkills, setExpandedSkills] = useState<string[]>([]);
  const [recent, setRecent] = useState<AiSourcingRecentItem[]>([]);
  const [recommended, setRecommended] = useState<AiSourcingRecommendedItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | ''>('');
  const [jobIntel, setJobIntel] = useState<JobIntelligence | null>(null);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [analyzingJob, setAnalyzingJob] = useState(false);
  const [skillsInput, setSkillsInput] = useState('');
  const [industriesInput, setIndustriesInput] = useState('');

  const loadMeta = useCallback(() => {
    api
      .aiSourcingRecent(10)
      .then((r) => setRecent(r.items))
      .catch(() => {});
    api
      .aiSourcingRecommended()
      .then((r) => setRecommended(r.items))
      .catch(() => {});
    api
      .getJobs()
      .then((list) => setJobs(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  function applyParse(parsed: AiSourcingParseResult) {
    setCriteria({ ...emptyCriteria(), ...parsed.criteria });
    setFieldConfidence(parsed.fieldConfidence);
    setParserMode(parsed.parserMode);
    setSkillsInput((parsed.criteria.skills || []).join(', '));
    setIndustriesInput((parsed.criteria.industries || []).join(', '));
    setShowCriteria(true);
  }

  function applySearchResult(data: {
    results: AiSourcingCandidateHit[];
    resultCount: number;
    criteria: CandidateSearchCriteria;
    fieldConfidence: FieldConfidence;
    parserMode: string;
    expandedSkills?: string[];
  }) {
    setResults(data.results);
    setResultCount(data.resultCount);
    setCriteria({ ...emptyCriteria(), ...data.criteria });
    setFieldConfidence(data.fieldConfidence);
    setParserMode(data.parserMode);
    setSkillsInput((data.criteria.skills || []).join(', '));
    setIndustriesInput((data.criteria.industries || []).join(', '));
    setExpandedSkills(data.expandedSkills || []);
    setShowCriteria(true);
  }

  async function interpret() {
    if (!query.trim()) return;
    setParsing(true);
    setError('');
    try {
      const parsed = await api.aiSourcingParse({ query: query.trim() });
      applyParse(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not interpret the request');
    } finally {
      setParsing(false);
    }
  }

  function criteriaFromForm(): CandidateSearchCriteria {
    const skills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const industries = industriesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      ...criteria,
      skills,
      industries,
      jobTitle: criteria.jobTitle || null,
      location: criteria.location || null,
      minExperienceYears:
        criteria.minExperienceYears === undefined || criteria.minExperienceYears === null
          ? null
          : Number(criteria.minExperienceYears),
      maxExperienceYears:
        criteria.maxExperienceYears === undefined || criteria.maxExperienceYears === null
          ? null
          : Number(criteria.maxExperienceYears),
      noticePeriodMaxDays:
        criteria.noticePeriodMaxDays === undefined || criteria.noticePeriodMaxDays === null
          ? null
          : Number(criteria.noticePeriodMaxDays),
      maxSalaryLpa:
        criteria.maxSalaryLpa === undefined || criteria.maxSalaryLpa === null
          ? null
          : Number(criteria.maxSalaryLpa),
    };
  }

  async function searchTalent(useEditedCriteria: boolean) {
    if (!query.trim() && !useEditedCriteria) return;
    setSearching(true);
    setError('');
    try {
      let body: { query: string; criteria?: CandidateSearchCriteria };
      if (useEditedCriteria && showCriteria) {
        body = { query: query.trim() || 'Structured search', criteria: criteriaFromForm() };
      } else {
        const parsed = await api.aiSourcingParse({ query: query.trim() });
        applyParse(parsed);
        body = { query: query.trim(), criteria: parsed.criteria };
      }
      const data = await api.aiSourcingSearch(body);
      applySearchResult(data);
      loadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function analyzeAndSearchJob() {
    if (!selectedJobId) return;
    setAnalyzingJob(true);
    setSearching(true);
    setError('');
    try {
      const intel = await api.aiSourcingAnalyzeJob(Number(selectedJobId));
      setJobIntel(intel.intelligence);
      applyParse({
        query: `Job #${selectedJobId}`,
        criteria: intel.criteria,
        fieldConfidence: intel.intelligence.fieldConfidence || {},
        parserMode: intel.parserMode as 'heuristic' | 'llm' | 'hybrid',
        unresolvedFields: [],
      });
      const data = await api.aiSourcingSearchFromJob(Number(selectedJobId), { refresh: false });
      applySearchResult(data);
      setQuery(data.query);
      loadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job sourcing failed');
    } finally {
      setAnalyzingJob(false);
      setSearching(false);
    }
  }

  async function openRecent(item: AiSourcingRecentItem) {
    setError('');
    try {
      const data = await api.aiSourcingSearchById(item.id);
      setQuery(data.query);
      applySearchResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that search');
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="search-bar">AI Talent Sourcing</div>
      </div>
      <div className="page-content">
        <h1 className="section-title">AI Talent Sourcing</h1>
        <p className="section-description">
          Describe who you need in plain language, or source from a job description. We interpret
          requirements, normalize skills, and run hybrid search across your talent pool. Separate from{' '}
          <Link to="/sourcing/copilot">Sourcing Copilot</Link>.
        </p>

        <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
          <div>
            <label className="form-label" htmlFor="ai-sourcing-query">
              Who are you looking for?
            </label>
            <textarea
              id="ai-sourcing-query"
              className="form-input"
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={EXAMPLE_QUERY}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Example:</span>
            <button
              type="button"
              className="job-filter-chip"
              onClick={() => setQuery(EXAMPLE_QUERY)}
              disabled={searching || parsing}
            >
              AWS Cloud Architects in Bangalore…
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              className="button-pill button-primary"
              type="button"
              onClick={() => searchTalent(showCriteria)}
              disabled={searching || parsing || !query.trim()}
            >
              {searching ? 'Searching…' : 'Search Talent'}
            </button>
            <button
              className="button-pill button-secondary"
              type="button"
              onClick={interpret}
              disabled={searching || parsing || !query.trim()}
            >
              {parsing ? 'Interpreting…' : 'Interpret criteria'}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            Source from job (JD intelligence)
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label className="form-label" htmlFor="ai-sourcing-job">
                Open job
              </label>
              <select
                id="ai-sourcing-job"
                className="form-input"
                value={selectedJobId}
                onChange={(e) =>
                  setSelectedJobId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">Select a job…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                    {j.city ? ` · ${j.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="button-pill button-primary"
              type="button"
              onClick={analyzeAndSearchJob}
              disabled={!selectedJobId || analyzingJob || searching}
            >
              {analyzingJob ? 'Analyzing JD…' : 'Analyze JD & search'}
            </button>
          </div>
          {jobIntel && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              JD role: {jobIntel.role || '—'} · Required:{' '}
              {(jobIntel.requiredSkills || []).slice(0, 8).join(', ') || '—'} · Seniority:{' '}
              {jobIntel.seniority || '—'}
            </p>
          )}
        </div>

        {error && (
          <div className="alert-banner danger" style={{ marginTop: '1rem' }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: '1rem',
            marginTop: '1rem',
          }}
          className="ai-sourcing-grid"
        >
          {showCriteria && (
            <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>
                  Interpreted criteria
                </h2>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Parser: {parserMode || '—'} · {formatConfidence(fieldConfidence)}
                </p>
                {expandedSkills.length > 0 && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Skill ontology expanded to: {expandedSkills.slice(0, 12).join(', ')}
                    {expandedSkills.length > 12 ? '…' : ''}
                  </p>
                )}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <label className="form-label" htmlFor="crit-skills">
                    Skills (comma-separated)
                  </label>
                  <input
                    id="crit-skills"
                    className="form-input"
                    value={skillsInput}
                    onChange={(e) => setSkillsInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="crit-industries">
                    Industries
                  </label>
                  <input
                    id="crit-industries"
                    className="form-input"
                    value={industriesInput}
                    onChange={(e) => setIndustriesInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="crit-location">
                    Location
                  </label>
                  <input
                    id="crit-location"
                    className="form-input"
                    value={criteria.location || ''}
                    onChange={(e) => setCriteria((c) => ({ ...c, location: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="crit-title">
                    Job title
                  </label>
                  <input
                    id="crit-title"
                    className="form-input"
                    value={criteria.jobTitle || ''}
                    onChange={(e) => setCriteria((c) => ({ ...c, jobTitle: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="crit-min-exp">
                    Min years
                  </label>
                  <input
                    id="crit-min-exp"
                    className="form-input"
                    type="number"
                    min={0}
                    value={criteria.minExperienceYears ?? ''}
                    onChange={(e) =>
                      setCriteria((c) => ({
                        ...c,
                        minExperienceYears: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="crit-notice">
                    Max notice (days)
                  </label>
                  <input
                    id="crit-notice"
                    className="form-input"
                    type="number"
                    min={0}
                    value={criteria.noticePeriodMaxDays ?? ''}
                    onChange={(e) =>
                      setCriteria((c) => ({
                        ...c,
                        noticePeriodMaxDays: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="crit-salary">
                    Max salary (LPA)
                  </label>
                  <input
                    id="crit-salary"
                    className="form-input"
                    type="number"
                    min={0}
                    value={criteria.maxSalaryLpa ?? ''}
                    onChange={(e) =>
                      setCriteria((c) => ({
                        ...c,
                        maxSalaryLpa: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="crit-stage">
                    Stage
                  </label>
                  <select
                    id="crit-stage"
                    className="form-input"
                    value={criteria.stage || ''}
                    onChange={(e) =>
                      setCriteria((c) => ({
                        ...c,
                        stage: e.target.value || null,
                      }))
                    }
                  >
                    <option value="">Any</option>
                    <option value="applied">Applied</option>
                    <option value="screening">Screening</option>
                    <option value="interview">Interview</option>
                    <option value="selected">Selected</option>
                    <option value="rejected">Rejected</option>
                    <option value="joined">Joined</option>
                  </select>
                </div>
              </div>
              <div>
                <button
                  className="button-pill button-primary"
                  type="button"
                  onClick={() => searchTalent(true)}
                  disabled={searching}
                >
                  {searching ? 'Searching…' : 'Search with edited criteria'}
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="card-title" style={{ marginTop: 0 }}>
              Recommended searches
            </h2>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {(recommended.length
                ? recommended
                : [{ label: 'AWS Cloud Architects', query: EXAMPLE_QUERY }]
              ).map((item) => (
                <button
                  key={item.query}
                  type="button"
                  className="job-filter-chip"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setQuery(item.query)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 className="card-title" style={{ marginTop: 0 }}>
            Results{' '}
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              ({resultCount} match{resultCount === 1 ? '' : 'es'})
            </span>
          </h2>
          {results.length === 0 ? (
            <p className="empty-inline">Run a search to see matching candidates from your talent pool.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Skills</th>
                    <th>Exp</th>
                    <th>Location</th>
                    <th>Stage</th>
                    <th>Hybrid</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/candidates/${row.id}`}>{row.name}</Link>
                      </td>
                      <td>{skillsToText(row.skills)}</td>
                      <td>{row.experienceYears}</td>
                      <td>{row.location || '—'}</td>
                      <td>{row.stage}</td>
                      <td>{row.hybridScore ?? '—'}</td>
                      <td style={{ fontSize: '0.8rem', maxWidth: 220 }}>
                        {(row.matchSignals || []).slice(0, 3).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 className="card-title" style={{ marginTop: 0 }}>
            Recent searches
          </h2>
          {recent.length === 0 ? (
            <p className="empty-inline">No searches yet in this workspace.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Results</th>
                    <th>Parser</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => openRecent(item)}
                          style={{
                            background: 'none',
                            border: 0,
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            padding: 0,
                            font: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          {item.query}
                        </button>
                      </td>
                      <td>{item.resultCount}</td>
                      <td>{item.parserMode}</td>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
