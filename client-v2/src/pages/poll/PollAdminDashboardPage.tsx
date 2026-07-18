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
import type { Poll, PollDashboard, PollQuestionAdmin, PollRecruiter, PollStatus } from '../../types';
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

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'poll'
  );
}

export default function PollAdminDashboardPage() {
  const { tenant } = useTenant();
  const [tab, setTab] = useState<Tab>('overview');
  const [polls, setPolls] = useState<Poll[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
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
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [newPollTitle, setNewPollTitle] = useState('');
  const [newPollSlug, setNewPollSlug] = useState('');
  const [newPollDescription, setNewPollDescription] = useState('');
  const [pollSaving, setPollSaving] = useState(false);

  const selectedPoll = useMemo(
    () => polls.find((p) => p.id === selectedPollId) || null,
    [polls, selectedPollId]
  );

  const shareUrl = useMemo(() => {
    if (!selectedPoll) return '';
    const path = pollPath(tenant.slug, selectedPoll.slug);
    return `${window.location.origin}${path}`;
  }, [selectedPoll, tenant.slug]);

  const loadPolls = useCallback(async () => {
    const data = await api.pollListPolls();
    setPolls(data.polls);
    return data.polls;
  }, []);

  const loadDashboard = useCallback(async (pollId: number) => {
    const data = await api.pollGetDashboard(pollId);
    setDashboard(data);
  }, []);

  const loadRecruiters = useCallback(
    async (pollId: number) => {
      const params: Record<string, string> = { pollId: String(pollId), sort, order };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const data = await api.pollGetRecruiters(params);
      setRecruiters(data.recruiters);
    },
    [search, statusFilter, sort, order]
  );

  const loadQuestions = useCallback(async (pollId: number) => {
    const data = await api.pollAdminGetQuestions(pollId);
    setQuestions(data.questions);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPolls()
      .then((list) => {
        if (list.length === 0) {
          setSelectedPollId(null);
          return;
        }
        setSelectedPollId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          const def = list.find((p) => p.is_default);
          return (def || list[0]).id;
        });
      })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load polls', 'error'))
      .finally(() => setLoading(false));
  }, [loadPolls]);

  useEffect(() => {
    if (!selectedPollId) {
      setDashboard(null);
      setRecruiters([]);
      setQuestions([]);
      return;
    }
    setLoading(true);
    Promise.all([
      loadDashboard(selectedPollId),
      loadRecruiters(selectedPollId),
      loadQuestions(selectedPollId),
    ])
      .catch((err) => showToast(err instanceof Error ? err.message : 'Failed to load poll admin', 'error'))
      .finally(() => setLoading(false));
  }, [selectedPollId, loadDashboard, loadRecruiters, loadQuestions]);

  useEffect(() => {
    if (tab !== 'recruiters' || !selectedPollId) return;
    loadRecruiters(selectedPollId).catch((err) =>
      showToast(err instanceof Error ? err.message : 'Failed to load recruiters', 'error')
    );
  }, [tab, loadRecruiters, selectedPollId]);

  const companies = useMemo(
    () => Array.from(new Set(recruiters.map((r) => r.company_name))).sort(),
    [recruiters]
  );

  async function createPoll(e: FormEvent) {
    e.preventDefault();
    if (!newPollTitle.trim()) {
      showToast('Poll title is required', 'error');
      return;
    }
    setPollSaving(true);
    try {
      const { poll } = await api.pollCreatePoll({
        title: newPollTitle.trim(),
        slug: newPollSlug.trim() || undefined,
        description: newPollDescription.trim() || undefined,
      });
      showToast('Poll created — add questions to get started', 'success');
      setCreatingPoll(false);
      setNewPollTitle('');
      setNewPollSlug('');
      setNewPollDescription('');
      const list = await loadPolls();
      setSelectedPollId(poll.id);
      if (!list.some((p) => p.id === poll.id)) {
        // list may already include it
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create poll', 'error');
    } finally {
      setPollSaving(false);
    }
  }

  async function updatePollStatus(status: PollStatus) {
    if (!selectedPoll) return;
    try {
      await api.pollUpdatePoll(selectedPoll.id, { status });
      showToast(`Poll marked as ${status}`, 'success');
      await loadPolls();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update poll', 'error');
    }
  }

  async function deleteSelectedPoll() {
    if (!selectedPoll) return;
    if (polls.length <= 1) {
      showToast('Cannot delete the last poll', 'error');
      return;
    }
    if (
      !window.confirm(
        `Delete “${selectedPoll.title}”? All questions, registrations, and results for this poll will be removed.`
      )
    ) {
      return;
    }
    try {
      await api.pollDeletePoll(selectedPoll.id);
      showToast('Poll deleted', 'success');
      const list = await loadPolls();
      setSelectedPollId(list[0]?.id ?? null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete poll', 'error');
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Share link copied', 'success');
    } catch {
      showToast(shareUrl, 'success');
    }
  }

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
    if (!selectedPollId) return;
    try {
      await api.pollExportRecruiters(selectedPollId);
      showToast('Export downloaded', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  }

  async function toggleActive(q: PollQuestionAdmin) {
    if (!selectedPollId) return;
    try {
      await api.pollAdminUpdateQuestion(q.id, { is_active: !q.is_active });
      showToast(q.is_active ? 'Question disabled' : 'Question enabled', 'success');
      await loadQuestions(selectedPollId);
      await loadDashboard(selectedPollId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  }

  async function deleteQuestion(id: number) {
    if (!selectedPollId) return;
    if (!window.confirm('Delete this question? Existing responses for it will also be removed.')) return;
    try {
      await api.pollAdminDeleteQuestion(id);
      showToast('Question deleted', 'success');
      await loadQuestions(selectedPollId);
      await loadDashboard(selectedPollId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  }

  async function saveQuestion(e: FormEvent) {
    e.preventDefault();
    if (!editing || !selectedPollId) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api.pollAdminUpdateQuestion(editing.id, editing);
        showToast('Question updated', 'success');
      } else {
        await api.pollAdminCreateQuestion(selectedPollId, editing);
        showToast('Question added', 'success');
      }
      setEditing(null);
      await loadQuestions(selectedPollId);
      await loadDashboard(selectedPollId);
      await loadPolls();
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

  if (loading && polls.length === 0) {
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
          Manage multiple polls for <strong>{tenant.name}</strong> — each poll has its own questions and
          participants.
        </p>

        <div className="poll-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <label className="form-group" style={{ margin: 0, minWidth: 220 }}>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
              Active poll
            </span>
            <select
              value={selectedPollId ?? ''}
              onChange={(e) => setSelectedPollId(e.target.value ? Number(e.target.value) : null)}
            >
              {polls.length === 0 && <option value="">No polls yet</option>}
              {polls.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.is_default ? ' (default)' : ''} — {p.status}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button-pill button-primary"
            onClick={() => setCreatingPoll((v) => !v)}
          >
            {creatingPoll ? 'Cancel' : 'Create poll'}
          </button>
          {selectedPoll && (
            <>
              <button type="button" className="button-pill button-secondary" onClick={copyShareLink}>
                Copy share link
              </button>
              <a
                href={pollPath(tenant.slug, selectedPoll.slug)}
                target="_blank"
                rel="noreferrer"
                className="button-pill button-secondary"
              >
                Open public link
              </a>
              {selectedPoll.status === 'open' ? (
                <button
                  type="button"
                  className="button-pill button-secondary"
                  onClick={() => updatePollStatus('closed')}
                >
                  Close poll
                </button>
              ) : (
                <button
                  type="button"
                  className="button-pill button-secondary"
                  onClick={() => updatePollStatus('open')}
                >
                  Reopen poll
                </button>
              )}
              {selectedPoll.status !== 'archived' && (
                <button
                  type="button"
                  className="button-pill button-secondary"
                  onClick={() => updatePollStatus('archived')}
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                className="button-pill button-secondary"
                onClick={deleteSelectedPoll}
                disabled={polls.length <= 1}
              >
                Delete poll
              </button>
            </>
          )}
        </div>

        {selectedPoll && (
          <p className="text-muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.85rem' }}>
            Share: <code>{shareUrl}</code>
            {' · '}
            {selectedPoll.question_count ?? questions.length} questions ·{' '}
            {selectedPoll.recruiter_count ?? recruiters.length} recruiters
          </p>
        )}

        {creatingPoll && (
          <form className="card poll-question-form" onSubmit={createPoll} style={{ marginBottom: '1.25rem' }}>
            <div className="card-title">Create a new poll</div>
            <p className="section-description" style={{ marginTop: 0 }}>
              Starts with an empty question bank. Existing polls and their data are not affected.
            </p>
            <label className="form-group">
              <span>Title</span>
              <input
                required
                value={newPollTitle}
                onChange={(e) => {
                  setNewPollTitle(e.target.value);
                  if (!newPollSlug) setNewPollSlug(slugify(e.target.value));
                }}
                placeholder="e.g. Q3 Recruiter Assessment"
              />
            </label>
            <label className="form-group">
              <span>URL slug (optional)</span>
              <input
                value={newPollSlug}
                onChange={(e) => setNewPollSlug(slugify(e.target.value))}
                placeholder="q3-assessment"
              />
            </label>
            <label className="form-group">
              <span>Description (optional)</span>
              <textarea
                rows={2}
                value={newPollDescription}
                onChange={(e) => setNewPollDescription(e.target.value)}
                placeholder="Shown on the public poll list"
              />
            </label>
            <div className="poll-nav">
              <button type="button" className="button-pill button-secondary" onClick={() => setCreatingPoll(false)}>
                Cancel
              </button>
              <button type="submit" className="button-pill button-primary" disabled={pollSaving}>
                {pollSaving ? 'Creating…' : 'Create poll'}
              </button>
            </div>
          </form>
        )}

        {!selectedPollId ? (
          <div className="card">
            <p className="text-muted">Create a poll to start managing questions and viewing results.</p>
          </div>
        ) : (
          <>
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
                  <button
                    type="button"
                    className="button-pill button-secondary"
                    onClick={() => selectedPollId && loadRecruiters(selectedPollId)}
                  >
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
                            <div
                              key={resp.id}
                              className={`poll-response-item${resp.is_correct ? ' is-correct' : ' is-wrong'}`}
                            >
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
                  {selectedPoll && (
                    <a
                      href={pollPath(tenant.slug, selectedPoll.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="button-pill button-secondary"
                    >
                      Open public registration
                    </a>
                  )}
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
                        {questions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-muted">
                              No questions yet — add questions for this poll.
                            </td>
                          </tr>
                        ) : (
                          questions.map((q) => (
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
                                <button
                                  type="button"
                                  className="link-button link-button--danger"
                                  onClick={() => deleteQuestion(q.id)}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
