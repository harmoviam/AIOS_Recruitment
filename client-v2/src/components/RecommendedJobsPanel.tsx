import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { JobRecommendation, RecommendJobsResponse } from '../types';

type DistanceFilter = 'all' | '5' | '10' | '20' | '50';

interface Props {
  candidateId: number;
  /** Changes after the candidate's stay coordinates are saved. */
  locationRevision?: string;
  onApply?: (jobId: number) => void;
}

/** Unique companies from job recommendations, keeping the best-match job per company. */
function uniqueCompanies(jobs: JobRecommendation[]): JobRecommendation[] {
  const byCompany = new Map<string, JobRecommendation>();
  for (const job of jobs) {
    const key = (job.company || '').trim().toLowerCase() || `job-${job.id}`;
    const existing = byCompany.get(key);
    if (!existing || job.matchScore > existing.matchScore) {
      byCompany.set(key, job);
    }
  }
  return [...byCompany.values()];
}

export default function RecommendedJobsPanel({ candidateId, locationRevision, onApply }: Props) {
  const [data, setData] = useState<RecommendJobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('all');

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { sort: 'match' };
    if (distanceFilter !== 'all') params.max_distance_km = distanceFilter;

    api
      .recommendJobs(candidateId, params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [candidateId, distanceFilter]);

  useEffect(() => {
    load();
  }, [load, locationRevision]);

  const companies = useMemo(
    () => uniqueCompanies(data?.recommendations ?? []),
    [data?.recommendations]
  );

  const handleApply = async (job: JobRecommendation) => {
    if (onApply) {
      onApply(job.id);
      return;
    }
    await api.updateCandidate(candidateId, { job_id: job.id, stage: 'screening' });
    load();
  };

  return (
    <section className="recommended-jobs-section">
      <div className="recommended-jobs-head">
        <div>
          <h3 className="card-heading">Suggested Companies</h3>
          <p className="text-muted">Companies with matching open roles for this candidate.</p>
        </div>
        <select
          className="input-field filter-select"
          value={distanceFilter}
          onChange={(e) => setDistanceFilter(e.target.value as DistanceFilter)}
          aria-label="Distance filter"
        >
          <option value="all">All distances</option>
          <option value="5">Within 5 KM</option>
          <option value="10">Within 10 KM</option>
          <option value="20">Within 20 KM</option>
          <option value="50">Within 50 KM</option>
        </select>
      </div>

      {loading && <p className="text-muted">Finding companies…</p>}

      {!loading && companies.length === 0 && (
        <p className="text-muted nearby-companies-msg">No matching companies found.</p>
      )}

      {!loading && companies.length > 0 && (
        <ul className="company-name-list">
          {companies.map((job) => (
            <li key={job.id}>
              <span className="company-name-list-name">{job.company || 'Unknown company'}</span>
              <span className="company-name-list-meta">
                {job.distance != null
                  ? `${job.distance} km`
                  : job.isRemote
                    ? 'Remote'
                    : 'Distance unavailable'}
                {' · '}
                match {job.matchScore}
              </span>
              <button
                type="button"
                className="link-button company-name-list-action"
                onClick={() => void handleApply(job)}
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
