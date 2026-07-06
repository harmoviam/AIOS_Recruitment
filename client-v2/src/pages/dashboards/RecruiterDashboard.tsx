import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import { useRefetchOnFocus } from '../../utils/useRefetchOnFocus';
import type { Candidate, FollowUp, Interview, RecruiterWorkflow } from '../../types';

function localDateParam(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function RecruiterDashboard() {
  const [workflow, setWorkflow] = useState<RecruiterWorkflow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  const load = () => {
    const today = localDateParam();
    Promise.all([
      api.getMyWorkflow(),
      api.getCandidates(),
      api.getInterviews({ date: today }),
      api.getFollowUps(),
    ]).then(([wf, cands, ivs, fus]) => {
      setWorkflow(wf);
      setCandidates(cands);
      setFollowUps(fus.filter((f) => f.status !== 'completed').slice(0, 5));
      setInterviews(ivs.slice(0, 4));
    });
  };

  useEffect(() => {
    load();
  }, []);
  useRefetchOnFocus(load);

  const kpis = workflow?.kpis;
  const hotCandidates = candidates.filter((c) => c.is_hot).slice(0, 4);
  const funnelData = workflow?.pipeline ?? [];
  const pipelineTotal = funnelData.reduce((sum, s) => sum + s.count, 0);

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Dashboard' }, { label: 'My Workflow' }]} />
      <div className="page-content">
        <h1 className="section-title">My Recruiting Workflow</h1>
        <p className="section-description">Track your candidates, follow-ups, interviews, and placements.</p>

        <div className="kpi-grid">
          <KpiCard title="My Candidates" value={kpis?.totalCandidates ?? '—'} href="/candidates" />
          <KpiCard title="Follow-ups" value={kpis?.pendingFollowups ?? '—'} meta={`${kpis?.overdueFollowups ?? 0} overdue`} metaVariant="warning" href="/follow-ups" />
          <KpiCard title="Interviews Today" value={kpis?.interviewsToday ?? interviews.length} href="/interviews" />
          <KpiCard title="Selected" value={kpis?.selected ?? '—'} meta="Offer stage" href="/candidates?filter=selected" />
          <KpiCard title="Joined" value={kpis?.joined ?? '—'} meta={`${kpis?.joiningsMtd ?? 0} this month`} href="/candidates?filter=joined" />
        </div>

        <div className="dashboard-grid">
          <div className="card">
            <div className="card-header-row">
              <h3 className="card-heading">My Pipeline</h3>
              <span className="pipeline-total">Total: <strong>{pipelineTotal}</strong> candidates</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData} margin={{ top: 16 }}>
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-header-row">
              <h3 className="card-heading">Pending Follow-ups</h3>
              <Link to="/follow-ups" className="link-button">View all</Link>
            </div>
            {followUps.length === 0 ? (
              <p className="text-muted">No pending follow-ups.</p>
            ) : (
              followUps.map((f) => (
                <div key={f.id} className="schedule-slot">
                  <Link to={`/candidates/${f.candidate_id}`}><strong>{f.candidate_name}</strong></Link>
                  <span className="text-muted"> · {f.status} · {f.type}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="card">
            <div className="card-header-row">
              <h3 className="card-heading">🔥 Hot Candidates</h3>
              <Link to="/candidates?filter=hot" className="link-button">View all</Link>
            </div>
            {hotCandidates.length === 0 ? (
              <p className="text-muted">No hot candidates yet. Mark a candidate as hot from their profile when you&apos;re confident they&apos;ll show up and join.</p>
            ) : (
              hotCandidates.map((c) => (
                <div key={c.id} className="suggestion-item">
                  <Link to={`/candidates/${c.id}`}><strong>{c.name}</strong></Link>
                  <span className="text-muted"> · Score {c.ai_score} · {c.stage}</span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3 className="card-heading">Recent Activity</h3>
            {(workflow?.recentActivities ?? []).map((a) => (
              <div key={a.id} className="activity-item">{a.description}</div>
            ))}
          </div>

          <div className="card">
            <div className="card-header-row">
              <h3 className="card-heading">Today&apos;s Interviews</h3>
              <Link to="/interviews" className="link-button">View all</Link>
            </div>
            {interviews.length === 0 ? (
              <p className="text-muted">No interviews today. <Link to="/interviews">Schedule one</Link></p>
            ) : (
              interviews.map((iv) => (
                <div key={iv.id} className="schedule-slot">
                  <div className="slot-time">{new Date(iv.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="slot-candidate">{iv.candidate_name} — {iv.round_type}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
