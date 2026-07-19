import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { showToast } from '../../utils/toast';
import type { CopilotPlanResponse, StructuredIntent } from '../../types/sourcing';
import { PlanSummaryCards, RecommendationsTable } from './components';

const EXAMPLES = [
  'Need 50 International Voice Process candidates in Mohali within 15 days',
  'Hire 20 fresher voice process agents in Mohali, salary up to 22000',
  'Looking for 30 international voice candidates in Mohali for night shift',
];

function IntentField({ label, value, unresolved }: { label: string; value: string; unresolved?: boolean }) {
  return (
    <div>
      <div className="card-title" style={{ marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ fontWeight: 600, color: unresolved ? 'var(--warning)' : 'var(--text)' }}>
        {value}
        {unresolved && <span style={{ fontWeight: 500, fontSize: '0.78rem' }}> · needs review</span>}
      </div>
    </div>
  );
}

export default function SourcingCopilotPage() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<StructuredIntent | null>(null);
  const [plan, setPlan] = useState<CopilotPlanResponse | null>(null);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [planning, setPlanning] = useState(false);

  const busy = parsing || planning;

  async function previewIntent() {
    setParsing(true);
    setError('');
    setPlan(null);
    try {
      setIntent(await api.sourcingCopilotParse(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not understand that request. Try rephrasing it.');
    } finally {
      setParsing(false);
    }
  }

  async function generatePlan() {
    setPlanning(true);
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
      if (data.intent) setIntent(data.intent);
      sessionStorage.setItem('sourcing_last_result', JSON.stringify(data.recommendations));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build a plan. Try adding a city and role.');
    } finally {
      setPlanning(false);
    }
  }

  function copyContent(body: string) {
    navigator.clipboard
      .writeText(body)
      .then(() => showToast('Copied to clipboard', 'success'))
      .catch(() => showToast('Copy failed', 'error'));
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">AI Sourcing Copilot</div></div>
      <div className="page-content">
        <h1 className="section-title">AI Sourcing Copilot</h1>
        <p className="section-description">
          Describe a hiring need in plain language. The copilot extracts the role, city, and headcount, then
          recommends the best sourcing channels with funnel estimates and ready-to-post content.
        </p>

        <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
          <div>
            <label className="form-label" htmlFor="copilot-need">Hiring need</label>
            <textarea
              id="copilot-need"
              className="form-input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Need 50 International Voice Process candidates in Mohali within 15 days"
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
                disabled={busy}
              >
                {ex}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            <button
              className="button-pill button-primary"
              type="button"
              onClick={generatePlan}
              disabled={busy || !text.trim()}
            >
              {planning ? 'Building plan…' : 'Generate sourcing plan'}
            </button>
            <button
              className="button-pill button-secondary"
              type="button"
              onClick={previewIntent}
              disabled={busy || !text.trim()}
            >
              {parsing ? 'Reading…' : 'Preview what I understood'}
            </button>
            <button
              className="link-button"
              type="button"
              onClick={() => navigate('/sourcing/search')}
            >
              Prefer a structured form? Open Find Sources →
            </button>
          </div>
        </div>

        {error && <div className="alert-banner danger" style={{ marginTop: '1rem' }}>{error}</div>}

        {intent && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">
              What the copilot understood · {(intent.confidence * 100).toFixed(0)}% confident
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.9rem' }}>
              <IntentField label="Role" value={intent.roleName || 'Not detected'} unresolved={!intent.roleId} />
              <IntentField label="City" value={intent.cityName || 'Not detected'} unresolved={!intent.cityId} />
              <IntentField label="Headcount" value={intent.hiringCount != null ? String(intent.hiringCount) : 'Not detected'} unresolved={intent.hiringCount == null} />
              <IntentField label="Experience" value={intent.experienceHint || '—'} />
              <IntentField label="Salary" value={intent.salaryHint != null ? intent.salaryHint.toLocaleString() : '—'} />
              <IntentField label="Timeline" value={intent.joiningTimelineDays != null ? `${intent.joiningTimelineDays} days` : '—'} />
            </div>
            {intent.unresolvedFields.length > 0 && (
              <p style={{ margin: '0.85rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Fields marked “needs review” weren’t matched to your data. Edit the text above, or use the
                structured form for full control.
              </p>
            )}
          </div>
        )}

        {plan && (
          <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
            <PlanSummaryCards summary={plan.recommendations.planSummary} />
            <RecommendationsTable recommendations={plan.recommendations.recommendations} />
            {plan.content && plan.content.items.length > 0 && (
              <div className="card">
                <div className="card-title">Ready-to-post content</div>
                <div style={{ display: 'grid', gap: '0.85rem' }}>
                  {plan.content.items.slice(0, 2).map((item) => (
                    <div
                      key={item.channel}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.85rem 1rem',
                        background: 'var(--surface-2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{item.title}</strong>
                        <button
                          type="button"
                          className="button-pill button-secondary btn-sm"
                          onClick={() => copyContent(item.body)}
                        >
                          Copy
                        </button>
                      </div>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.82rem', margin: 0, fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
                        {item.body}
                      </pre>
                    </div>
                  ))}
                </div>
                <button
                  className="link-button"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => navigate('/sourcing/content')}
                >
                  Open Content Studio for all channels →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
