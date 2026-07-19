import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { PeopleRunListItem, PeopleSearchResult } from '../../types/sourcing';
import { CandidateResultsTable } from './components';

const EXAMPLES = [
  'International voice process candidates in Mohali with 1+ years experience',
  'Fresher customer support agents in Chandigarh',
  'Team leads for night-shift voice process in Mohali',
];

export default function SourcingPeoplePage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<PeopleSearchResult | null>(() => {
    try {
      const cached = sessionStorage.getItem('sourcing_last_people');
      return cached ? (JSON.parse(cached).result ?? JSON.parse(cached)) : null;
    } catch {
      return null;
    }
  });
  const [runs, setRuns] = useState<PeopleRunListItem[]>([]);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingRun, setLoadingRun] = useState<string | null>(null);

  useEffect(() => {
    api
      .sourcingPeopleRuns()
      .then(setRuns)
      .catch(() => {});
  }, []);

  async function search() {
    setSearching(true);
    setError('');
    try {
      const data = await api.sourcingCopilotPeople({ text });
      setResult(data.result);
      sessionStorage.setItem('sourcing_last_people', JSON.stringify(data));
      api
        .sourcingPeopleRuns()
        .then(setRuns)
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Candidate search failed. Try again in a minute.');
    } finally {
      setSearching(false);
    }
  }

  async function openRun(run: PeopleRunListItem) {
    setLoadingRun(run.id);
    setError('');
    try {
      const data = await api.sourcingPeopleRun(run.id);
      setResult(data);
      if (data.promptText) setText(data.promptText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that search.');
    } finally {
      setLoadingRun(null);
    }
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">Candidate Profiles</div></div>
      <div className="page-content">
        <h1 className="section-title">Candidate Profiles</h1>
        <p className="section-description">
          Search individual candidate profiles across external people databases. Describe who you are
          looking for — role, city, skills, experience — and get matching profiles with LinkedIn links.
        </p>

        <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
          <div>
            <label className="form-label" htmlFor="people-need">Who are you looking for?</label>
            <textarea
              id="people-need"
              className="form-input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. International voice process candidates in Mohali with 1+ years experience"
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="job-filter-chip"
                onClick={() => setText(ex)}
                disabled={searching}
              >
                {ex}
              </button>
            ))}
          </div>
          <div>
            <button
              className="button-pill button-primary"
              type="button"
              onClick={search}
              disabled={searching || !text.trim()}
            >
              {searching ? 'Searching…' : 'Find candidates'}
            </button>
          </div>
        </div>

        {error && <div className="alert-banner danger" style={{ marginTop: '1rem' }}>{error}</div>}

        {searching && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p className="empty-inline">Searching candidate databases…</p>
          </div>
        )}
        {!searching && result && (
          <div style={{ marginTop: '1rem' }}>
            <CandidateResultsTable result={result} />
          </div>
        )}

        {runs.length > 0 && (
          <div className="card table-wrap" style={{ marginTop: '1rem' }}>
            <div className="card-title">Recent searches</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Search</th>
                  <th>Profiles</th>
                  <th>Provider</th>
                  <th>Credits</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td style={{ maxWidth: 320, fontSize: '0.85rem' }}>
                      {run.prompt_text || <span style={{ color: 'var(--text-secondary)' }}>Filter search</span>}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{run.result_count}</td>
                    <td style={{ fontSize: '0.82rem' }}>{run.provider}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{run.credits_used}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {new Date(run.created_date).toLocaleString()}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button-pill button-secondary btn-sm"
                        onClick={() => openRun(run)}
                        disabled={loadingRun === run.id}
                      >
                        {loadingRun === run.id ? 'Loading…' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
