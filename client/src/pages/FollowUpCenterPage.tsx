import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import Tabs from '../components/ui/Tabs';
import type { FollowUp } from '../types';

const TAB_IDS = ['today', 'overdue', 'upcoming', 'completed', 'missed'] as const;

export default function FollowUpCenterPage() {
  const [tab, setTab] = useState<string>('today');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = () => {
    api.getFollowUps().then(setFollowUps);
    api.getFollowUpCounts().then(setCounts);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered =
    tab === 'today'
      ? followUps.filter((f) => f.status === 'today' || f.status === 'overdue')
      : followUps.filter((f) => f.status === tab);

  const markDone = async (id: number) => {
    await api.updateFollowUp(id, { completed: true });
    load();
  };

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Follow-up Center' }]} />
      <div className="page-content">
        <PageHeader
          title="Follow-up Center"
          description="Dedicated workspace for all follow-up work — overdue, today, and upcoming."
        />

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={TAB_IDS.map((id) => ({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            count: counts[id] ?? 0,
          }))}
        />

        <div className="follow-up-list">
          {filtered.map((f) => (
            <div key={f.id} className={`follow-up-card${f.status === 'overdue' ? ' overdue' : ''}`}>
              <div className="follow-up-header">
                <div>
                  {f.status === 'overdue' && <span className="escalation-badge">⚠ Overdue</span>}
                  <Link to={`/candidates/${f.candidate_id}`} className="follow-up-name">
                    {f.candidate_name}
                  </Link>
                  <span className="text-muted"> · {f.job_title}</span>
                </div>
                <span className="text-muted">{new Date(f.due_at).toLocaleDateString()}</span>
              </div>
              <p className="text-muted">Type: {f.type}</p>
              {f.ai_suggestion && <div className="ai-chip">🤖 {f.ai_suggestion}</div>}
              <div className="follow-up-actions">
                <button type="button" className="button-pill button-secondary btn-sm">📞 Call</button>
                <Link to="/messages" className="button-pill button-secondary btn-sm">💬 WhatsApp</Link>
                <button type="button" className="button-pill button-secondary btn-sm">✉ Email</button>
                <button type="button" className="button-pill button-primary btn-sm" onClick={() => markDone(f.id)}>
                  ✓ Done
                </button>
                <button type="button" className="button-pill button-secondary btn-sm">Reschedule</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="empty-inline">No follow-ups in this category.</p>}
        </div>
      </div>
    </>
  );
}
