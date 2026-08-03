import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import CandidateLocationFields, { type CandidateLocationValue } from '../components/CandidateLocationFields';
import NearbyCompaniesPanel from '../components/NearbyCompaniesPanel';
import RecommendedJobsPanel from '../components/RecommendedJobsPanel';
import Tabs from '../components/ui/Tabs';
import ScorePicker from '../components/ui/ScorePicker';
import { FALLBACK_RED_FLAG_QUESTIONS, RED_FLAG_SIGNALS, SCREENING_QUESTIONS, atsScoreClass, formatQuestionDuration, interviewEvaluationSummary, riskBadgeClass, screeningRiskLevel, type JobScreeningQuestions, type RedFlagPack, type RedFlagQuestion, type ScreeningQuestionDef } from '../types';
import type { Application, Candidate, Interview, Job, Message, TimelineEvent } from '../types';
import { inferJobIndustry, isBpoIndustry } from '../utils/industries';

const APPLICATION_STAGES = ['applied', 'screening', 'interview', 'selected', 'rejected', 'joined'];

const DETAIL_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'screening', label: 'Screening' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'communication', label: 'Communication' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'notes', label: 'Notes' },
  { id: 'ai', label: 'AI Insights' },
];

const RED_FLAG_FIELDS = RED_FLAG_SIGNALS.map((q) => q.id);

const TIMELINE_SOURCE_LABELS: Record<TimelineEvent['source'], string> = {
  activity: 'Activity',
  message: 'Message',
  interview: 'Interview',
  follow_up: 'Follow-up',
};

function timelineSummary(ev: TimelineEvent) {
  return ev.description || ev.content || ev.type || '—';
}

function timelineActor(ev: TimelineEvent) {
  if (ev.actor_name) return ev.actor_name;
  if (ev.source === 'message' && ev.is_outgoing === false) return ev.sender || 'Candidate';
  return null;
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [prescreenQuestions, setPrescreenQuestions] = useState<ScreeningQuestionDef[]>(SCREENING_QUESTIONS);
  const [scheduledQuestions, setScheduledQuestions] = useState<ScreeningQuestionDef[]>([]);
  const [screeningMeta, setScreeningMeta] = useState<Pick<
    JobScreeningQuestions,
    'screening_duration_seconds' | 'scheduled_duration_seconds' | 'screening_total_seconds' | 'scheduled_total_seconds' | 'industry' | 'experience_band' | 'source'
  > | null>(null);
  const [screeningJobTitle, setScreeningJobTitle] = useState<string | null>(null);
  const [screeningStatus, setScreeningStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [redFlagPack, setRedFlagPack] = useState<RedFlagPack | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    email: '',
    experience_years: 0,
    salary_expectation: '',
    skills: '',
  });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [reparseLoading, setReparseLoading] = useState(false);
  const [reparseError, setReparseError] = useState('');
  const [stayLocation, setStayLocation] = useState<CandidateLocationValue>({
    current_location: '',
    latitude: null,
    longitude: null,
    relocation_allowed: false,
  });
  const [staySaving, setStaySaving] = useState(false);
  const [stayError, setStayError] = useState('');
  const [staySaved, setStaySaved] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [submitJobId, setSubmitJobId] = useState('');
  const [appsError, setAppsError] = useState('');
  const [appsBusy, setAppsBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const cid = Number(id);
    api.getCandidate(cid).then((c) => {
      setCandidate(c);
      setStayLocation({
        current_location: c.current_location || '',
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        relocation_allowed: Boolean(c.relocation_allowed),
      });
      setNotes(c.notes || '');
      const applyScores = (questions: ScreeningQuestionDef[]) => {
        const fields = [...questions.map((q) => q.id), ...RED_FLAG_FIELDS];
        setScores(
          Object.fromEntries(fields.map((f) => [f, (c.screening?.[f as keyof typeof c.screening] as number | null) ?? null]))
        );
      };
      api.getCandidateScreeningQuestions(cid)
        .then((r) => {
          const questions = r.questions.prescreen?.length ? r.questions.prescreen : SCREENING_QUESTIONS;
          setPrescreenQuestions(questions);
          setScheduledQuestions(r.questions.interview || []);
          setScreeningMeta({
            screening_duration_seconds: r.questions.screening_duration_seconds,
            scheduled_duration_seconds: r.questions.scheduled_duration_seconds,
            screening_total_seconds: r.questions.screening_total_seconds,
            scheduled_total_seconds: r.questions.scheduled_total_seconds,
            industry: r.questions.industry,
            experience_band: r.questions.experience_band,
            source: r.questions.source,
          });
          setScreeningJobTitle(r.job_title);
          applyScores(questions);
        })
        .catch(() => applyScores(SCREENING_QUESTIONS));
    });
    api.getCandidateRedFlagQuestions(cid).then(setRedFlagPack).catch(() => setRedFlagPack(null));
    api.getInterviews({ candidate_id: String(cid) }).then(setInterviews);
    api.getMessages(cid).then(setMessages);
    api.getCandidateTimeline(cid).then(setTimeline);
    api.getCandidateSuggestions(cid).then((r) => setSuggestions(r.suggestions));
    api.getCandidateApplications(cid).then(setApplications).catch(() => setApplications([]));
    api.getJobs().then(setAllJobs).catch(() => setAllJobs([]));
  }, [id]);

  const reloadApplications = () => {
    if (id) api.getCandidateApplications(Number(id)).then(setApplications).catch(() => undefined);
  };

  const handleSubmitToJob = async () => {
    if (!id || !submitJobId) return;
    setAppsBusy(true);
    setAppsError('');
    try {
      await api.submitCandidateToJob(Number(id), Number(submitJobId));
      setSubmitJobId('');
      reloadApplications();
      api.getCandidate(Number(id)).then(setCandidate);
    } catch (err) {
      setAppsError((err as Error).message);
    } finally {
      setAppsBusy(false);
    }
  };

  const handleApplicationStage = async (app: Application, stage: string) => {
    setAppsError('');
    try {
      await api.updateApplication(app.id, { stage });
      reloadApplications();
      api.getCandidate(Number(id)).then(setCandidate);
    } catch (err) {
      setAppsError((err as Error).message);
    }
  };

  const handleWithdraw = async (app: Application) => {
    if (!window.confirm(`Withdraw ${candidate?.name || 'candidate'} from ${app.job_title || 'this job'}?`)) return;
    setAppsError('');
    try {
      await api.withdrawApplication(app.id);
      reloadApplications();
      api.getCandidate(Number(id)).then(setCandidate);
    } catch (err) {
      setAppsError((err as Error).message);
    }
  };

  if (!candidate) return <div className="page-content">Loading…</div>;

  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];

  const saveNotes = async () => {
    await api.updateCandidate(candidate.id, { notes });
  };

  const toggleHot = async () => {
    const updated = await api.updateCandidate(candidate.id, { is_hot: !candidate.is_hot });
    setCandidate(updated);
  };

  const maxPrescreenScore = prescreenQuestions.length * 5;
  const totalScore = prescreenQuestions.reduce((sum, q) => sum + (scores[q.id] ?? 0), 0);
  // Server-issued probes when available; the static list is the offline fallback.
  const redFlagSignals: RedFlagQuestion[] = redFlagPack?.questions?.length
    ? redFlagPack.questions
    : FALLBACK_RED_FLAG_QUESTIONS;
  const totalRedFlags = redFlagSignals.reduce((sum, q) => sum + (scores[q.id] ?? 0), 0);
  // A signal scored 3 or below counts as a red flag (unscored signals don't count).
  const redFlagCount = redFlagSignals.filter((q) => {
    const s = scores[q.id];
    return s != null && s <= 3;
  }).length;

  // Stay location, nearby companies, and suggested companies only matter where
  // commute distance decides whether the candidate joins — i.e. BPO hiring.
  const primaryJob = allJobs.find((j) => j.id === candidate.job_id) || null;
  const candidateIndustry =
    redFlagPack?.industry || (primaryJob ? inferJobIndustry(primaryJob) : null);
  const isBpoCandidate =
    isBpoIndustry(candidateIndustry) ||
    applications.some((a) => {
      const job = allJobs.find((j) => j.id === a.job_id);
      return job ? isBpoIndustry(inferJobIndustry(job)) : false;
    });
  // 5+ red flags: stop — reduce interview time, pre-screening questions are blocked.
  const screeningBlocked = redFlagCount >= 5;
  const riskLevel = screeningRiskLevel(totalScore, maxPrescreenScore);

  const setScore = (field: string, value: number | null) => {
    setScores((prev) => ({ ...prev, [field]: value }));
    setScreeningStatus('idle');
  };

  const saveScreening = async () => {
    setScreeningStatus('saving');
    const updated = await api.saveScreening(candidate.id, scores);
    setCandidate(updated);
    setScreeningStatus('saved');
  };

  const startEditProfile = () => {
    setProfileForm({
      name: candidate.name,
      phone: candidate.phone || '',
      email: candidate.email || '',
      experience_years: candidate.experience_years,
      salary_expectation: candidate.salary_expectation || '',
      skills: skills.join(', '),
    });
    setProfileError('');
    setEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setEditingProfile(false);
    setProfileError('');
  };

  const saveStayLocation = async () => {
    setStayError('');
    setStaySaved(false);
    if (stayLocation.latitude == null || stayLocation.longitude == null) {
      setStayError('Pick a place from the Google Maps suggestions (typing alone does not save coordinates).');
      return;
    }
    setStaySaving(true);
    try {
      const updated = await api.updateCandidate(candidate.id, {
        current_location: stayLocation.current_location,
        latitude: stayLocation.latitude,
        longitude: stayLocation.longitude,
        relocation_allowed: stayLocation.relocation_allowed,
      });
      setCandidate({ ...candidate, ...updated });
      setStayLocation({
        current_location: updated.current_location || stayLocation.current_location,
        latitude: updated.latitude ?? stayLocation.latitude,
        longitude: updated.longitude ?? stayLocation.longitude,
        relocation_allowed: Boolean(updated.relocation_allowed),
      });
      setStaySaved(true);
    } catch (err) {
      setStayError(err instanceof Error ? err.message : 'Failed to save stay location');
    } finally {
      setStaySaving(false);
    }
  };

  const saveProfile = async () => {
    setProfileError('');
    setProfileSaving(true);
    try {
      const skillsList = profileForm.skills.split(',').map((s) => s.trim()).filter(Boolean);
      const updated = await api.updateCandidate(candidate.id, {
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim(),
        email: profileForm.email.trim() || undefined,
        experience_years: profileForm.experience_years,
        salary_expectation: profileForm.salary_expectation.trim() || undefined,
        skills: skillsList,
      });
      setCandidate({ ...candidate, ...updated });
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleReparseResume = async (file?: File) => {
    if (!candidate) return;
    setReparseError('');
    setReparseLoading(true);
    try {
      const result = await api.reparseResume(candidate.id, file);
      setCandidate(result.candidate);
    } catch (err) {
      setReparseError(err instanceof Error ? err.message : 'Failed to reparse resume');
    } finally {
      setReparseLoading(false);
    }
  };

  const handleDownloadResume = async () => {
    if (!candidate?.resume_meta?.original_filename) return;
    try {
      await api.downloadResume(candidate.id, candidate.resume_meta.original_filename);
    } catch (err) {
      setReparseError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  return (
    <>
      <div className="topbar">
        <button type="button" className="button-pill button-secondary" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`button-pill ${candidate.is_hot ? 'button-primary' : 'button-secondary'}`}
            onClick={toggleHot}
            title={candidate.is_hot ? 'Remove hot candidate flag' : 'Mark when you are confident this candidate will attend and join'}
          >
            {candidate.is_hot ? '🔥 Hot Candidate' : '🔥 Mark as Hot'}
          </button>
          <Link to={`/interviews?candidate=${candidate.id}`} className="button-pill button-primary">
            Schedule Interview
          </Link>
          <Link to={`/messages?candidate=${candidate.id}&from=${encodeURIComponent(location.pathname)}`} className="button-pill button-secondary">
            WhatsApp
          </Link>
        </div>
      </div>
      <div className="page-content candidate-detail">
        <div className="detail-header">
          <div>
            <h1 className="section-title">
              {candidate.name}
              {candidate.is_hot && <span className="hot-flame" title="Hot candidate">🔥</span>}
            </h1>
            <p className="section-description">
              {candidate.job_title || 'Unassigned'} • {candidate.experience_years} yrs experience
            </p>
          </div>
          <div className="ai-score-large">{candidate.ai_score}</div>
        </div>

        <Tabs tabs={DETAIL_TABS} active={tab} onChange={setTab} />

        {tab === 'profile' && (
          <div className="section-split">
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div className="card-title" style={{ margin: 0 }}>Contact</div>
                  {!editingProfile && (
                    <button type="button" className="button-pill button-secondary" onClick={startEditProfile}>
                      Edit
                    </button>
                  )}
                </div>
                {editingProfile ? (
                  <>
                    {profileError && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{profileError}</div>}
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-name">Full name</label>
                        <input
                          id="edit-name"
                          className="input-field"
                          value={profileForm.name}
                          onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-phone">Phone</label>
                        <input
                          id="edit-phone"
                          className="input-field"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          placeholder="+91"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-email">Email</label>
                        <input
                          id="edit-email"
                          type="email"
                          className="input-field"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-exp">Experience (years)</label>
                        <input
                          id="edit-exp"
                          type="number"
                          min={0}
                          className="input-field"
                          value={profileForm.experience_years}
                          onChange={(e) => setProfileForm({ ...profileForm, experience_years: Number(e.target.value) })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-salary">Salary expectation</label>
                        <input
                          id="edit-salary"
                          className="input-field"
                          value={profileForm.salary_expectation}
                          onChange={(e) => setProfileForm({ ...profileForm, salary_expectation: e.target.value })}
                          placeholder="e.g. 5 LPA"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-skills">Skills (comma-separated)</label>
                        <input
                          id="edit-skills"
                          className="input-field"
                          value={profileForm.skills}
                          onChange={(e) => setProfileForm({ ...profileForm, skills: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="form-actions" style={{ marginTop: '0.75rem' }}>
                      <button type="button" className="button-pill button-secondary" onClick={cancelEditProfile} disabled={profileSaving}>
                        Cancel
                      </button>
                      <button type="button" className="button-pill button-primary" onClick={saveProfile} disabled={profileSaving}>
                        {profileSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>{candidate.email || '—'}</p>
                    <p>{candidate.phone || '—'}</p>
                    <p>Recruiter: {candidate.recruiter_name || '—'}</p>
                    <p>Salary: {candidate.salary_expectation || '—'}</p>
                  </>
                )}
              </div>
              {!editingProfile && (
                <div className="card">
                  <div className="card-title">Skills</div>
                  <div className="candidate-skills">
                    {skills.map((s) => (
                      <div key={s} className="skill-tag">{s}</div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div className="card-title" style={{ margin: 0 }}>Resume</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {candidate.resume_meta?.storage_path && (
                      <>
                        <button type="button" className="button-pill button-secondary btn-sm" onClick={() => void handleDownloadResume()}>
                          Download
                        </button>
                        <button
                          type="button"
                          className="button-pill button-secondary btn-sm"
                          disabled={reparseLoading}
                          onClick={() => void handleReparseResume()}
                        >
                          {reparseLoading ? 'Reparsing…' : 'Reparse Resume'}
                        </button>
                      </>
                    )}
                    <label className="button-pill button-primary btn-sm" style={{ cursor: reparseLoading ? 'wait' : 'pointer' }}>
                      Upload New
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        hidden
                        disabled={reparseLoading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleReparseResume(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
                {reparseError && <div className="form-error" style={{ marginBottom: '0.5rem' }}>{reparseError}</div>}
                {candidate.resume_meta?.ai_confidence != null && (
                  <p className="text-muted">
                    AI confidence: <span className="ai-chip">{Math.round(candidate.resume_meta.ai_confidence * 100)}%</span>
                    {candidate.resume_meta.original_filename && <> · {candidate.resume_meta.original_filename}</>}
                  </p>
                )}
                {!candidate.resume_meta?.storage_path && (
                  <p className="text-muted">No resume on file. Upload one via Reparse Resume.</p>
                )}
                {candidate.professional_summary && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <strong>Summary</strong>
                    <p>{candidate.professional_summary}</p>
                  </div>
                )}
                {(candidate.experience?.length ?? 0) > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <strong>Experience</strong>
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                      {candidate.experience!.map((exp, i) => (
                        <li key={`${exp.company}-${i}`}>
                          {exp.title} at {exp.company}
                          {exp.start_date || exp.end_date ? ` (${exp.start_date || '?'} – ${exp.end_date || 'Present'})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(candidate.education?.length ?? 0) > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <strong>Education</strong>
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                      {candidate.education!.map((ed, i) => (
                        <li key={`${ed.institution}-${i}`}>{ed.degree} — {ed.institution}{ed.year ? ` (${ed.year})` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(candidate.linkedin || candidate.github || candidate.portfolio) && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <strong>Links</strong>
                    <p className="text-muted">
                      {candidate.linkedin && <>LinkedIn: {candidate.linkedin}<br /></>}
                      {candidate.github && <>GitHub: {candidate.github}<br /></>}
                      {candidate.portfolio && <>Portfolio: {candidate.portfolio}</>}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Stage</div>
              <p className="text-muted">
                Current: <strong>{candidate.stage}</strong>
                {candidate.offer_status && (
                  <> · Outcome: <strong>{candidate.offer_status.replace(/_/g, ' ')}</strong></>
                )}
              </p>
              {candidate.screening && (
                <p style={{ marginTop: '0.5rem' }}>
                  <span className={riskBadgeClass(candidate.screening.risk_level)}>
                    {candidate.screening.risk_level}
                  </span>
                  <span className="text-muted" style={{ marginLeft: '0.5rem' }}>
                    Screening {candidate.screening.total_score}/25 · Red flags {candidate.screening.total_red_flags}/35
                  </span>
                </p>
              )}
            </div>
            {candidate.ats_score != null && (
              <div className="card">
                <div className="screening-section-head">
                  <div>
                    <div className="card-title">Resume ATS score</div>
                    <p className="text-muted">
                      How well the uploaded resume parses and matches the JD
                      {candidate.ats_details?.scored_against_job ? '' : ' (no JD keywords scored — assign a job to include them)'}.
                    </p>
                  </div>
                  <span className={atsScoreClass(candidate.ats_score)}>
                    {candidate.ats_score}/100
                    {candidate.ats_details?.grade ? ` · ${candidate.ats_details.grade}` : ''}
                  </span>
                </div>
                {candidate.ats_details?.categories?.length ? (
                  <ul className="ats-breakdown">
                    {candidate.ats_details.categories.map((c) => (
                      <li key={c.key}>
                        <span className="ats-breakdown-label">{c.label}</span>
                        <span className="ats-breakdown-score">{c.score}/{c.max}</span>
                        <span className="ats-breakdown-detail text-muted">{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {candidate.ats_details?.recommendations?.length ? (
                  <>
                    <div className="screening-row-label" style={{ marginTop: '0.75rem' }}>How to improve</div>
                    <ul className="ats-recommendations">
                      {candidate.ats_details.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        {tab === 'jobs' && (
          <div className="card">
            <div className="card-title">Job applications</div>
            <p className="section-description" style={{ marginBottom: '1rem' }}>
              A candidate can be submitted to multiple jobs — each application tracks its own stage.
            </p>
            {appsError && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{appsError}</div>}

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <select
                className="input-field"
                style={{ maxWidth: '320px' }}
                value={submitJobId}
                onChange={(e) => setSubmitJobId(e.target.value)}
              >
                <option value="">Select a job to submit to…</option>
                {allJobs
                  .filter((j) => !applications.some((a) => a.job_id === j.id))
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.client}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="button-pill button-primary"
                disabled={!submitJobId || appsBusy}
                onClick={handleSubmitToJob}
              >
                {appsBusy ? 'Submitting…' : 'Submit to job'}
              </button>
            </div>

            {applications.length === 0 ? (
              <p className="section-description">Not submitted to any job yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Client</th>
                    <th>Stage</th>
                    <th>AI score</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td>
                        {app.job_title || `Job #${app.job_id}`}
                        {candidate.job_id === app.job_id && (
                          <span className="status-badge" style={{ marginLeft: '0.5rem' }}>Primary</span>
                        )}
                      </td>
                      <td>{app.job_client || '—'}</td>
                      <td>
                        <select
                          className="input-field"
                          value={app.stage}
                          onChange={(e) => handleApplicationStage(app, e.target.value)}
                        >
                          {APPLICATION_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{app.ai_score != null ? `${Number(app.ai_score).toFixed(1)}/10` : '—'}</td>
                      <td>{new Date(app.updated_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          type="button"
                          className="button-pill button-secondary"
                          onClick={() => handleWithdraw(app)}
                        >
                          Withdraw
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'screening' && (
          <div className="screening-form">
            {isBpoCandidate && (
              <>
                <div className="card stay-location-card" style={{ marginBottom: '1rem' }}>
                  <div className="card-title">Candidate stay location</div>
                  <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
                    BPO hiring lives or dies on commute — select a place from Google Maps suggestions so
                    nearby companies can be ranked by distance.
                    {candidate.latitude != null && candidate.longitude != null
                      ? ' Coordinates are saved.'
                      : ' Coordinates are missing for this candidate.'}
                  </p>
                  <CandidateLocationFields
                    value={stayLocation}
                    onChange={(loc) => {
                      setStayLocation(loc);
                      setStaySaved(false);
                      setStayError('');
                    }}
                    disabled={staySaving}
                  />
                  {stayError && <p className="form-error" style={{ marginTop: '0.5rem' }}>{stayError}</p>}
                  {staySaved && !stayError && (
                    <p className="text-muted" style={{ marginTop: '0.5rem', color: '#16a34a' }}>
                      Stay location saved.
                    </p>
                  )}
                  <div className="form-actions" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="button-pill button-primary btn-sm"
                      onClick={() => void saveStayLocation()}
                      disabled={staySaving}
                    >
                      {staySaving ? 'Saving…' : 'Save stay location'}
                    </button>
                  </div>
                </div>

                <NearbyCompaniesPanel
                  candidateId={candidate.id}
                  latitude={stayLocation.latitude}
                  longitude={stayLocation.longitude}
                />
                <RecommendedJobsPanel
                  candidateId={candidate.id}
                  locationRevision={`${candidate.latitude ?? ''}:${candidate.longitude ?? ''}`}
                  onApply={async (jobId) => {
                    const updated = await api.updateCandidate(candidate.id, { job_id: jobId, stage: 'screening' });
                    setCandidate(updated);
                  }}
                />
              </>
            )}

            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="screening-section-head">
                <div>
                  <div className="card-title">Red Flag Signals — First 5–7 Minutes</div>
                  <p className="text-muted">
                    {redFlagPack
                      ? `Standard intent check for ${redFlagPack.job_title || 'this role'}${redFlagPack.industry ? ` · ${redFlagPack.industry}` : ''} · ${redFlagPack.experience_band_label}. `
                      : ''}
                    Ask each question as written, then score the answer: 1 (strong red flag) to 5 (no concern).
                    A score of 3 or below counts as a red flag.
                  </p>
                </div>
                <div className="screening-total">
                  Total Red Flags <strong>{totalRedFlags}</strong>/{redFlagSignals.length * 5}
                </div>
              </div>

              {redFlagPack && redFlagPack.salary_alignment.level !== 'ok' && (
                <div
                  className={`alert-banner${
                    redFlagPack.salary_alignment.level === 'over_budget'
                      ? ' danger'
                      : redFlagPack.salary_alignment.level === 'tight'
                        ? ' warning'
                        : ''
                  }`}
                  style={{ marginBottom: '0.75rem' }}
                >
                  💰 <strong>Salary check:</strong> {redFlagPack.salary_alignment.message}
                </div>
              )}

              {redFlagSignals.map((q) => (
                <div key={q.id} className="screening-row">
                  <div className="screening-row-info">
                    <div className="screening-row-label">
                      {q.label}
                      {q.time_seconds ? (
                        <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.4rem' }}>
                          {formatQuestionDuration(q.time_seconds)}
                        </span>
                      ) : null}
                    </div>
                    {q.ask && <div className="screening-row-ask">“{q.ask}”</div>}
                    {q.good_answer && (
                      <div className="screening-row-answers">
                        <div className="answer-good">
                          <strong>Good (4–5):</strong> {q.good_answer}
                        </div>
                        <div className="answer-red">
                          <strong>Red flag (1–3):</strong> {q.red_answer}
                        </div>
                      </div>
                    )}
                    <div className="screening-row-hint">{q.hint}</div>
                  </div>
                  <ScorePicker value={scores[q.id] ?? null} onChange={(v) => setScore(q.id, v)} label={q.label} />
                </div>
              ))}
              {screeningBlocked && (
                <div className="alert-banner danger" style={{ marginTop: '0.75rem' }}>
                  🛑 <strong>Quick Recruiter Tip:</strong> {redFlagCount} red flags scored 3 or below —
                  reduce interview time and move on. Pre-screening questions are blocked.
                </div>
              )}
            </div>

            <div className={`card${screeningBlocked ? ' screening-card-blocked' : ''}`} style={{ marginBottom: '1rem' }}>
              <div className="screening-section-head">
                <div>
                  <div className="card-title">
                    Screening Questions
                    <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                      max {Math.round((screeningMeta?.screening_duration_seconds || 300) / 60)} min
                      {screeningMeta?.screening_total_seconds
                        ? ` · ${formatQuestionDuration(screeningMeta.screening_total_seconds)} packed`
                        : ''}
                    </span>
                  </div>
                  <p className="text-muted">
                    {screeningBlocked
                      ? 'Blocked — 5+ red flags in the first 5–7 minutes.'
                      : screeningJobTitle
                        ? `Standard first-call scorecard for ${screeningJobTitle}${screeningMeta?.industry ? ` · ${screeningMeta.industry}` : ''}. Same questions for every candidate on this job. Score 1–5.`
                        : 'First-call quick scorecard (≤5 min). Score each answer 1 (weak) to 5 (strong).'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div className="screening-total">
                    Total Score <strong>{totalScore}</strong>/{maxPrescreenScore}
                  </div>
                </div>
              </div>
              {prescreenQuestions.map((q) => (
                <div key={q.id} className="screening-row">
                  <div className="screening-row-info">
                    <div className="screening-row-label">
                      {q.label}
                      {q.time_seconds ? (
                        <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.4rem' }}>
                          {formatQuestionDuration(q.time_seconds)}
                        </span>
                      ) : null}
                    </div>
                    {q.requirement && (
                      <div className="screening-row-hint text-muted" style={{ fontSize: '0.8rem' }}>
                        JD requirement: {q.requirement}
                      </div>
                    )}
                    <div className="screening-row-hint">{q.hint}</div>
                  </div>
                  <ScorePicker
                    value={scores[q.id] ?? null}
                    onChange={(v) => setScore(q.id, v)}
                    label={q.label}
                    disabled={screeningBlocked}
                  />
                </div>
              ))}
              <div className="screening-risk-line">
                Risk Level: <span className={riskBadgeClass(riskLevel)}>{riskLevel}</span>
                <span className="text-muted"> — auto-calculated from total score vs max ({maxPrescreenScore})</span>
              </div>
            </div>

            {scheduledQuestions.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="screening-section-head">
                  <div>
                    <div className="card-title">
                      Scheduled Questions
                      <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                        max {Math.round((screeningMeta?.scheduled_duration_seconds || 900) / 60)} min
                        {screeningMeta?.scheduled_total_seconds
                          ? ` · ${formatQuestionDuration(screeningMeta.scheduled_total_seconds)} packed`
                          : ''}
                      </span>
                    </div>
                    <p className="text-muted">
                      Use these during the scheduled interview round. Times are speaking hints that sum to ≤15 minutes.
                      {screeningMeta?.source ? ` Source: ${screeningMeta.source}.` : ''}
                    </p>
                  </div>
                </div>
                <ol className="jd-screening-preview" style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {scheduledQuestions.map((q) => (
                    <li key={q.id} style={{ marginBottom: '0.65rem' }}>
                      <strong>{q.label}</strong>
                      {q.time_seconds ? (
                        <span className="text-muted"> · {formatQuestionDuration(q.time_seconds)}</span>
                      ) : null}
                      {q.requirement ? (
                        <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                          Focus: {q.requirement}
                        </div>
                      ) : null}
                      <div className="text-muted" style={{ fontSize: '0.85rem' }}>{q.hint}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="screening-actions">
              <button
                type="button"
                className="button-pill button-primary"
                onClick={saveScreening}
                disabled={screeningStatus === 'saving'}
              >
                {screeningStatus === 'saving' ? 'Saving…' : 'Save Screening'}
              </button>
              {screeningStatus === 'saved' && <span className="text-muted">Saved ✓</span>}
              {candidate.screening?.updated_at && screeningStatus !== 'saved' && (
                <span className="text-muted">
                  Last saved {new Date(candidate.screening.updated_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}

        {tab === 'timeline' && (
          <div className="card">
            {timeline.length === 0 ? (
              <p className="text-muted">No activity yet.</p>
            ) : (
              timeline.map((ev) => {
                const actor = timelineActor(ev);
                return (
                  <div key={`${ev.source}-${ev.id}`} className="schedule-slot timeline-event">
                    <div className="slot-info">
                      <div className="slot-time">{new Date(ev.created_at).toLocaleString()}</div>
                      <div className="slot-candidate">
                        <span className="text-muted">{TIMELINE_SOURCE_LABELS[ev.source]}</span>
                        {' · '}
                        {timelineSummary(ev)}
                      </div>
                      {actor && (
                        <div className="timeline-actor">
                          {ev.source === 'message' && ev.is_outgoing === false ? 'From' : 'By'} {actor}
                        </div>
                      )}
                    </div>
                    {ev.status && <span className="slot-status">{ev.status}</span>}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'communication' && (
          <div className="card">
            {messages.length === 0 ? (
              <p className="text-muted">No messages yet.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`suggestion-item${m.is_outgoing ? '' : ' inbound'}`}>
                  <strong>{m.sender}</strong> · {new Date(m.sent_at).toLocaleString()}
                  <br />{m.content}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'interviews' && (
          <div>
            <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
              Open <strong>Interview Screening</strong> to rate the 19 BPO/CRM questions for each scheduled call.
              The <strong>Screening</strong> tab above is the separate first-call pre-screen scorecard.
            </p>
            <div className="card">
            {interviews.length === 0 ? (
              <p className="text-muted">No interviews yet</p>
            ) : (
              interviews.map((iv) => (
                <div key={iv.id} className="schedule-slot">
                  <div className="slot-info">
                    <div className="slot-time">{new Date(iv.scheduled_at).toLocaleString()}</div>
                    <div className="slot-candidate">
                      {iv.round_type} • {iv.status}
                      {iv.score != null ? ` • Score ${iv.score}/10` : ''}
                      {interviewEvaluationSummary(iv.evaluation) && (
                        <> • Screening: {interviewEvaluationSummary(iv.evaluation)}</>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Link to={`/interviews/${iv.id}/evaluate`} className="button-pill button-primary">
                      Interview Screening
                    </Link>
                    <Link to={`/interviews/${iv.id}/room`} className="button-pill button-secondary">
                      Join call
                    </Link>
                  </div>
                </div>
              ))
            )}
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <div className="card">
            <textarea
              className="input-field"
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add recruiter notes…"
            />
            <button type="button" className="button-pill button-primary" style={{ marginTop: '0.75rem' }} onClick={saveNotes}>
              Save Notes
            </button>
          </div>
        )}

        {tab === 'ai' && (
          <div className="card">
            {candidate.salary_expectation && (
              <div className="suggestion-item">
                <strong>Salary expectation</strong><br />{candidate.salary_expectation}
              </div>
            )}
            {suggestions.map((s) => (
              <div key={s} className="suggestion-item">{s}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
