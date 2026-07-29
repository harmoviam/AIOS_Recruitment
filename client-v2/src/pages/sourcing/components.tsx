import type { CSSProperties } from 'react';
import type { PeopleSearchResult, RecommendationResult, SourceRecommendation } from '../../types/sourcing';

const RISK_META: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Low risk', color: 'var(--success)' },
  MEDIUM: { label: 'Medium risk', color: 'var(--warning)' },
  HIGH: { label: 'High risk', color: 'var(--danger)' },
};

export function RiskBadge({ risk }: { risk: string }) {
  const meta = RISK_META[risk] ?? { label: risk, color: 'var(--text-secondary)' };
  return (
    <span className="status-badge" style={{ '--badge-color': meta.color } as CSSProperties}>
      <span className="status-dot" />
      {meta.label}
    </span>
  );
}

function safeExternalUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function channelLabel(channelType?: string) {
  if (!channelType) return '';
  return channelType
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function PlanSummaryCards({ summary }: { summary: RecommendationResult['planSummary'] }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      <div className="card">
        <div className="card-title">Estimated Applications</div>
        <div className="card-value">{summary.expectedApplications.toLocaleString()}</div>
      </div>
      <div className="card">
        <div className="card-title">Estimated Interviews</div>
        <div className="card-value">{summary.expectedInterviews.toLocaleString()}</div>
      </div>
      <div className="card">
        <div className="card-title">Estimated Joinings</div>
        <div className="card-value">{summary.expectedJoinings.toLocaleString()}</div>
      </div>
      <div className="card">
        <div className="card-title">Overall Risk</div>
        <div style={{ marginTop: '0.35rem' }}>
          <RiskBadge risk={summary.overallRisk} />
        </div>
      </div>
    </div>
  );
}

function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(Math.max(0, Math.min(score, 1)) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 110 }}>
      <div
        aria-hidden
        style={{
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: 'var(--surface-2)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--primary)' }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  );
}

export function RecommendationsTable({
  recommendations,
  title,
}: {
  recommendations: SourceRecommendation[];
  title?: string;
}) {
  if (recommendations.length === 0) {
    return (
      <div className="card">
        <p className="empty-inline">
          No matching sources yet. Add sourcing channels for this city and role, then try again.
        </p>
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      <div className="card-title">{title ?? `Configured sources (${recommendations.length})`}</div>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 44 }}>#</th>
            <th>Source</th>
            <th>Confidence</th>
            <th>Estimated Apps</th>
            <th>Estimated Interviews</th>
            <th>Estimated Joinings</th>
            <th>Risk</th>
            <th>Why this source</th>
          </tr>
        </thead>
        <tbody>
          {recommendations.map((r) => (
            <tr key={r.sourceId}>
              <td style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{r.priority}</td>
              <td>
                {r.website ? (
                  <a
                    href={safeExternalUrl(r.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
                    title={r.website}
                  >
                    {r.sourceName} ↗
                  </a>
                ) : (
                  <div style={{ fontWeight: 600 }}>{r.sourceName}</div>
                )}
                {r.channelType && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    {channelLabel(r.channelType)}
                    {r.isSampleData && (
                      <span
                        className="status-badge"
                        style={{ marginLeft: '0.45rem', verticalAlign: 'middle' }}
                        title="This is a preconfigured demonstration record, not live platform data."
                      >
                        Sample data
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td>
                <ConfidenceMeter score={r.confidenceScore} />
              </td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.expectedApplications.toLocaleString()}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.expectedInterviews.toLocaleString()}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.expectedJoinings.toLocaleString()}</td>
              <td>
                <RiskBadge risk={r.risk} />
              </td>
              <td style={{ maxWidth: 300, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CandidateResultsTable({ result }: { result: PeopleSearchResult }) {
  if (result.error) {
    return (
      <div className="card">
        <div className="card-title">Matching candidates</div>
        <p className="empty-inline">{result.error}</p>
      </div>
    );
  }

  if (result.profiles.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Matching candidates</div>
        <p className="empty-inline">
          No individual profiles found for these filters. Coverage varies by city and role — try
          broader skills or a nearby metro.
        </p>
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Matching candidates ({result.profiles.length}
          {result.total != null && result.total > result.profiles.length
            ? ` of ${result.total.toLocaleString()}`
            : ''}
          )
        </div>
        {result.mode === 'simulated' && (
          <span className="status-badge" style={{ '--badge-color': 'var(--warning)' } as CSSProperties}>
            <span className="status-dot" />
            Sample data
          </span>
        )}
        {result.mode === 'live' && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            credits used: {result.creditsUsed}
          </span>
        )}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Title</th>
            <th>Company</th>
            <th>Location</th>
            <th>Skills</th>
            <th>Experience</th>
          </tr>
        </thead>
        <tbody>
          {result.profiles.map((p) => (
            <tr key={p.id}>
              <td>
                {p.linkedinUrl ? (
                  <a
                    href={safeExternalUrl(p.linkedinUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
                    title="Open LinkedIn profile"
                  >
                    {p.fullName} ↗
                  </a>
                ) : (
                  <span style={{ fontWeight: 600 }}>{p.fullName}</span>
                )}
              </td>
              <td>{p.jobTitle ?? '—'}</td>
              <td>{p.company ?? '—'}</td>
              <td style={{ fontSize: '0.82rem' }}>{p.location ?? '—'}</td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', maxWidth: 260 }}>
                  {p.skills.slice(0, 5).map((skill) => (
                    <span key={skill} className="job-filter-chip" style={{ cursor: 'default' }}>
                      {skill}
                    </span>
                  ))}
                  {p.skills.length > 5 && (
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                      +{p.skills.length - 5} more
                    </span>
                  )}
                </div>
              </td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                {p.experienceYears != null ? `${p.experienceYears} yrs` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
