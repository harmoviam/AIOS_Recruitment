import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../api/client';
import TopBar from '../../components/ui/TopBar';
import KpiCard from '../../components/ui/KpiCard';
import type { Candidate, FollowUp, Interview, RecruiterWorkflow } from '../../types';

export default function RecruiterDashboard() {
  const [workflow, setWorkflow] = useState<RecruiterWorkflow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  useEffect(() => {
    Promise.all([
      api.getMyWorkflow(),
      api.getCandidates(),
      api.getInterviews(),
      api.getFollowUps(),
    ]).then(([wf, cands, ivs, fus]) => {
      setWorkflow(wf);
      setCandidates(cands);
      setFollowUps(fus.filter((f) => f.status !== 'completed').slice(0, 5));
      const today = new Date().toDateString();
      setInterviews(ivs.filter((i) => new Date(i.scheduled_at).toDateString() === today).slice(0, 4));
    });
  }, []);

  const kpis = workflow?.kpis;
  const hotCandidates = candidates.filter((c) => c.ai_score >= 8).slice(0, 4);
  const funnelData = workflow?.pipeline ?? [];

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
          <KpiCard title="Joinings MTD" value={kpis?.joiningsMtd ?? '—'} href="/candidates?filter=joined" />
        </div>

        <div className="dashboard-grid">
          <div className="card">
            <h3 className="card-heading">My Pipeline</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData}>
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
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
            <h3 className="card-heading">Hot Candidates</h3>
            {hotCandidates.map((c) => (
              <div key={c.id} className="suggestion-item">
                <Link to={`/candidates/${c.id}`}><strong>{c.name}</strong></Link>
                <span className="text-muted"> · Score {c.ai_score} · {c.stage}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="card-heading">Recent Activity</h3>
            {(workflow?.recentActivities ?? []).map((a) => (
              <div key={a.id} className="activity-item">{a.description}</div>
            ))}
          </div>

          <div className="card">
            <h3 className="card-heading">Today&apos;s Interviews</h3>
            {interviews.length === 0 ? (
              <p className="text-muted">No interviews today.</p>
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
