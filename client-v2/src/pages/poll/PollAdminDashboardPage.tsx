import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client';
import { useTenant } from '../../context/TenantContext';
import type { PollDashboard, PollQuestionAdmin, PollRecruiter } from '../../types';
import { pollPath } from '../../utils/pollSession';
import { showToast } from '../../utils/toast';

type Tab = 'overview' | 'recruiters' | 'questions';

const emptyQuestion = {
  question: '',
  option1: '',
  option2: '',
  option3: '',
  option4: '',
  correct_option: 4,
  is_active: true,
  sort_order: 0,
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PollAdminDashboardPage() {
  const { tenant } = useTenant();
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<PollDashboard | null>(null);
  const [recruiters, setRecruiters] = useState<PollRecruiter[]>([]);
  const [questions, setQuestions] = useState<PollQuestionAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('completed_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [responses, setResponses] = useState<Awaited<ReturnType<typeof api.pollGetRecruiterResponses>> | null>(null);
  const [editing, setEditing] = useState<Partial<PollQuestionAdmin> | null>(null);
  const [saving, setSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    const data = await api.pollGetDashboard();
    setDashboard(data);
  }, []);

  const loadRecruiters = useCallback(async () => {
    const params: Record<string, string> = { sort, order };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    const data = await api.pollGetRecruiters(params);
    setRecruiters(data.recruiters);
  }, [search, statusFilter, sort, order]);

  const loadQuestions = useCallback(async () => {
    const data = await api.pollAdminGetQuestions();
    setQuestions(data.questions);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDashboard(), loadRecruiters(), loadQuestions()])
      .catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load poll admin', 'error'))
      .finally(() => setLoading(false));
  }, [loadDashboard, loadRecruiters, loadQuestions]);

  useEffect(() => {
    if (tab !== 'recruiters') return;
    loadRecruiters().catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load recruiters', 'error'));
  }, [tab, loadRecruiters]);

  const companies = useMemo(
    () => Array.from(new Set(recruiters.map((r) => r.company_name))).sort(),
    [recruiters]
  );

  async function openResponses(id: number) {
    try {
      const data = await api.pollGetRecruiterResponses(id);
      setSelectedId(id);
      setResponses(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load responses', 'error');
    }
  }

  async function exportExcel() {
    try {
      await api.pollExportRecruiters();
      showToast('Export downloaded', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }

  async function toggleActive(q: PollQuestionAdmin) {
    try {
      await api.pollAdminUpdateQuestion(q.id, { is_active: !q.is_active });
      showToast(q.is_active ? 'Question disabled' : 'Question enabled', 'success');
      await loadQuestions();
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  }

  async function deleteQuestion(id: number) {
    if (!window.confirm('Delete this question? Existing responses for it will also be removed.')) return;
    try {
      await api.pollAdminDeleteQuestion(id);
      showToast('Question deleted', 'success');
      await loadQuestions();
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  }

  async function saveQuestion(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api.pollAdminUpdateQuestion(editing.id, editing);
        showToast('Question updated', 'success');
      } else {
        await api.pollAdminCreateQuestion(editing);
        showToast('Question added', 'success');
      }
      setEditing(null);
      await loadQuestions();
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleSort(column: string) {
    if (sort === column) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(column);
      setOrder('desc');
    }
  }

  if (loading && !dashboard) {
    return <div className="page-content poll-loading">Loading poll admin…</div>;
  }

  const cards = dashboard?.cards;

  return (
    <>
      <div className="topbar">
        <div className="search-bar">Recruiter Poll & Assessment</div>
      </div>
      <div className="page-content">
        <h1 className="section-title">Poll Admin Dashboard</h1>
        <p className="section-description">
          Tenant-scoped analytics for <strong>{tenant.name}</strong> — recruiter scores, participation, and questions.
        </p>

        <div className="poll-admin-tabs">
          {(
            [
              ['overview', 'Overview'],
              ['recruiters', 'Recruiters'],
              ['questions', 'Questions'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`poll-admin-tab${tab === key ? ' is-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && cards && dashboard && (
          <>
            <div className="grid poll-kpi-grid">
              <div className="card">
                <div className="card-title">Total Recruiters Registered</div>
                <div className="card-value">{cards.total_recruiters}</div>
              </div>
              <div className="card">
                <div className="card-title">Total Poll Attempts</div>
                <div className="card-value">{cards.total_attempts}</div>
              </div>
              <div className="card">
                <div className="card-title">Average Score</div>
                <div className="card-value">{cards.average_score}%</div>
              </div>
              <div className="card">
                <div className="card-title">Pass Percentage</div>
                <div className="card-value text-success">{cards.pass_percentage}%</div>
              </div>
              <div className="card">
                <div className="card-title">Fail Percentage</div>
                <div className="card-value text-danger">{cards.fail_percentage}%</div>
              </div>
            </div>

            <div className="section-split" style={{ marginTop: '1.5rem' }}>
              <div className="card">
                <div className="card-title">Recruiter-wise Score</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dashboard.charts.recruiter_scores}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="score" fill="var(--primary)" name="Score" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="card-title">Company-wise Participation</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dashboard.charts.company_participation}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="company" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="recruiters" fill="#0369a1" name="Recruiters" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="section-split" style={{ marginTop: '1.5rem' }}>
              <div className="card">
                <div className="card-title">Pass vs Fail</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dashboard.charts.pass_vs_fail}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#15803d" name="Count" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="card-title">Question-wise Accuracy (%)</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dashboard.charts.question_accuracy}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="question" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Accuracy']}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as { full_question?: string } | undefined;
                        return row?.full_question || '';
                      }}
                    />
                    <Bar dataKey="accuracy" fill="#4f46e5" name="Accuracy %" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {tab === 'recruiters' && (
          <>
            <div className="poll-toolbar">
              <input
                className="poll-search"
                placeholder="Search name, email, mobile, company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setSearch(e.target.value);
                }}
                aria-label="Filter by company"
              >
                <option value="">Filter company…</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="button" className="button-pill button-secondary" onClick={() => loadRecruiters()}>
                Apply
              </button>
              <button type="button" className="button-pill button-primary" onClick={exportExcel}>
                Export to Excel
              </button>
            </div>

            <div className="card table-card">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {[
                        ['name', 'Name'],
                        ['email', 'Email'],
                        ['company', 'Company'],
                        ['score', 'Score'],
                        ['percentage', 'Percentage'],
                        ['status', 'Status'],
                        ['completed_at', 'Attempt Date'],
                      ].map(([key, label]) => (
                        <th key={key}>
                          <button type="button" className="poll-sort-btn" onClick={() => toggleSort(key)}>
                            {label}
                            {sort === key ? (order === 'asc' ? ' ↑' : ' ↓') : ''}
                          </button>
                        </th>
                      ))}
                      <th>Mobile</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recruiters.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-muted">
                          No recruiters found
                        </td>
                      </tr>
                    ) : (
                      recruiters.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.email}</td>
                          <td>{r.company_name}</td>
                          <td>{r.score ?? '—'}</td>
                          <td>{r.percentage != null ? `${r.percentage}%` : '—'}</td>
                          <td>
                            {r.status ? (
                              <span className={`poll-status-pill poll-status-pill--${r.status}`}>
                                {r.status === 'pass' ? 'Pass' : 'Fail'}
                              </span>
                            ) : (
                              <span className="text-muted">Not attempted</span>
                            )}
                          </td>
                          <td>{formatDate(r.completed_at)}</td>
                          <td>{r.mobile}</td>
                          <td>
                            <button type="button" className="link-button" onClick={() => openResponses(r.id)}>
                              View responses
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {responses && selectedId != null && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-heading-row">
                  <div className="card-title">Responses — {responses.recruiter.name}</div>
                  <button type="button" className="button-pill button-secondary" onClick={() => setResponses(null)}>
                    Close
                  </button>
                </div>
                <div className="poll-response-list">
                  {responses.responses.length === 0 ? (
                    <p className="text-muted">No responses recorded.</p>
                  ) : (
                    responses.responses.map((resp) => {
                      const options = [resp.option1, resp.option2, resp.option3, resp.option4];
                      return (
                        <div key={resp.id} className={`poll-response-item${resp.is_correct ? ' is-correct' : ' is-wrong'}`}>
                          <strong>
                            Q{resp.sort_order}. {resp.question}
                          </strong>
                          <p>
                            Selected: {options[resp.selected_option - 1]}{' '}
                            {resp.is_correct ? '✓' : `✗ (correct: ${options[resp.correct_option - 1]})`}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'questions' && (
          <>
            <div className="poll-toolbar">
              <button
                type="button"
                className="button-pill button-primary"
                onClick={() => setEditing({ ...emptyQuestion, sort_order: questions.length + 1 })}
              >
                Add Question
              </button>
              <a
                href={pollPath(tenant.slug)}
                target="_blank"
                rel="noreferrer"
                className="button-pill button-secondary"
              >
                Open public registration
              </a>
            </div>

            {editing && (
              <form className="card poll-question-form" onSubmit={saveQuestion}>
                <div className="card-title">{editing.id ? 'Edit Question' : 'Add Question'}</div>
                <label className="form-group">
                  <span>Question</span>
                  <textarea
                    required
                    rows={3}
                    value={editing.question || ''}
                    onChange={(e) => setEditing({ ...editing, question: e.target.value })}
                  />
                </label>
                {[1, 2, 3, 4].map((n) => (
                  <label key={n} className="form-group">
                    <span>Option {n}</span>
                    <input
                      required
                      value={(editing[`option${n}` as keyof PollQuestionAdmin] as string) || ''}
                      onChange={(e) => setEditing({ ...editing, [`option${n}`]: e.target.value })}
                    />
                  </label>
                ))}
                <div className="poll-form-row">
                  <label className="form-group">
                    <span>Correct option</span>
                    <select
                      value={editing.correct_option || 4}
                      onChange={(e) => setEditing({ ...editing, correct_option: Number(e.target.value) })}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </label>
                  <label className="form-group">
                    <span>Sort order</span>
                    <input
                      type="number"
                      value={editing.sort_order || 0}
                      onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                    />
                  </label>
                  <label className="form-group poll-checkbox">
                    <input
                      type="checkbox"
                      checked={editing.is_active !== false}
                      onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                    />
                    <span>Active</span>
                  </label>
                </div>
                <div className="poll-nav">
                  <button type="button" className="button-pill button-secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="button-pill button-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Question'}
                  </button>
                </div>
              </form>
            )}

            <div className="card table-card">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Question</th>
                      <th>Correct</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q) => (
                      <tr key={q.id}>
                        <td>{q.sort_order}</td>
                        <td>{q.question}</td>
                        <td>Option {q.correct_option}</td>
                        <td>
                          <span className={`poll-status-pill poll-status-pill--${q.is_active ? 'pass' : 'fail'}`}>
                            {q.is_active ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td className="poll-actions">
                          <button type="button" className="link-button" onClick={() => setEditing(q)}>
                            Edit
                          </button>
                          <button type="button" className="link-button" onClick={() => toggleActive(q)}>
                            {q.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button type="button" className="link-button link-button--danger" onClick={() => deleteQuestion(q.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
