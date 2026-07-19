import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { CopilotPlanResponse, StructuredIntent } from '../../types/sourcing';

export default function SourcingCopilotPage() {
  const navigate = useNavigate();
  const [text, setText] = useState('Need 50 International Voice Process candidates in Mohali.');
  const [intent, setIntent] = useState<StructuredIntent | null>(null);
  const [plan, setPlan] = useState<CopilotPlanResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function parse() {
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      setIntent(await api.sourcingCopilotParse(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    setLoading(true);
    setError('');
    try {
      const data = await api.sourcingCopilotPlan({
        text,
        cityId: intent?.cityId,
        roleId: intent?.roleId,
        hiringCount: intent?.hiringCount,
        joiningTimelineDays: intent?.joiningTimelineDays,
        salaryMax: intent?.salaryHint,
        includeContent: true,
      });
      setPlan(data);
      sessionStorage.setItem('sourcing_last_result', JSON.stringify(data.recommendations));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">AI Sourcing Copilot</div></div>
      <div className="page-content">
        <h1 className="section-title">AI Sourcing Copilot</h1>
        <p className="section-description">
          Type a hiring need. The system extracts structured fields (no external LLM) and builds a sourcing plan.
        </p>

        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" type="button" onClick={parse} disabled={loading}>Parse intent</button>
            <button className="btn btn-primary" type="button" onClick={generatePlan} disabled={loading}>
              {loading ? 'Working…' : 'Confirm & Generate Plan'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => navigate('/sourcing/search')}>
              Open search form
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}

        {intent && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">Structured intent (confidence {(intent.confidence * 100).toFixed(0)}%)</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li>Role: {intent.roleName || '—'} {intent.roleId ? '' : '(unresolved)'}</li>
              <li>City: {intent.cityName || '—'} {intent.cityId ? '' : '(unresolved)'}</li>
              <li>Hiring count: {intent.hiringCount ?? '—'}</li>
              <li>Experience: {intent.experienceHint || '—'}</li>
              <li>Salary hint: {intent.salaryHint ?? '—'}</li>
            </ul>
          </div>
        )}

        {plan && (
          <div style={{ marginTop: '1rem' }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <div className="card"><div className="card-title">Applications</div><div className="card-value">{plan.recommendations.planSummary.expectedApplications}</div></div>
              <div className="card"><div className="card-title">Interviews</div><div className="card-value">{plan.recommendations.planSummary.expectedInterviews}</div></div>
              <div className="card"><div className="card-title">Joinings</div><div className="card-value">{plan.recommendations.planSummary.expectedJoinings}</div></div>
              <div className="card"><div className="card-title">Risk</div><div className="card-value">{plan.recommendations.planSummary.overallRisk}</div></div>
            </div>
            <div className="card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
              <div className="card-title">Recommended sources</div>
              <table className="data-table">
                <thead>
                  <tr><th>P</th><th>Source</th><th>Conf</th><th>Join</th><th>Risk</th><th>Reason</th></tr>
                </thead>
                <tbody>
                  {plan.recommendations.recommendations.map((r) => (
                    <tr key={r.sourceId}>
                      <td>{r.priority}</td>
                      <td>{r.sourceName}</td>
                      <td>{r.confidenceScore}</td>
                      <td>{r.expectedJoinings}</td>
                      <td>{r.risk}</td>
                      <td style={{ fontSize: 12 }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.content && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-title">Content pack preview</div>
                {plan.content.items.slice(0, 2).map((item) => (
                  <div key={item.channel} style={{ marginBottom: '0.75rem' }}>
                    <strong>{item.title}</strong>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{item.body}</pre>
                  </div>
                ))}
                <button className="btn btn-ghost" type="button" onClick={() => navigate('/sourcing/content')}>
                  Open Content Studio
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
