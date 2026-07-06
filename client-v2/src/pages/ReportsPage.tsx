import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import Tabs from '../components/ui/Tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList, Cell } from 'recharts';

const FUNNEL_COLORS = ['#2563EB', '#4F46E5', '#7C3AED', '#0D9488', '#059669'];

export default function ReportsPage() {
  const { user } = useAuth();
  const isRecruiter = user?.role === 'recruiter';
  const [tab, setTab] = useState('recruiter');
  const [days, setDays] = useState(30);
  const [reportData, setReportData] = useState<unknown>(null);

  const reportTabs = [
    { id: 'recruiter', label: isRecruiter ? 'My Performance' : 'Recruiter Performance' },
    { id: 'funnel', label: isRecruiter ? 'My Funnel' : 'Recruitment Funnel' },
    { id: 'offer', label: 'Offer Acceptance' },
  ];

  useEffect(() => {
    api.getReport(tab, days).then((r) => setReportData(r.data));
  }, [tab, days]);

  const recruiterPerf = (reportData as { name: string; placements: number; total?: number; selected?: number }[]) || [];
  const funnel = (reportData as { stage: string; count: number }[]) || [];
  const offer = reportData as { offers: number; accepted: number; rejected: number; acceptance_rate: number } | null;

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Reports' }]} />
      <div className="page-content">
        <PageHeader
          title={isRecruiter ? 'My Reports' : 'Reports Dashboard'}
          description={
            isRecruiter
              ? 'Your personal placement performance, pipeline funnel, and offer outcomes.'
              : 'Organization-wide performance across all recruiters — charts, tables, and export.'
          }
          actions={
            <>
              <select className="input-field filter-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last year</option>
              </select>
              <button type="button" className="button-pill button-secondary" onClick={() => api.exportReport(tab, days)}>
                Export CSV
              </button>
            </>
          }
        />

        <Tabs tabs={reportTabs} active={tab} onChange={setTab} />

        {tab === 'recruiter' && (
          <div className="card">
            <h3 className="card-heading">{isRecruiter ? 'My Placement Performance' : 'Recruiter Performance'}</h3>
            {!isRecruiter && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={recruiterPerf}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="placements" name="Placements" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {isRecruiter && recruiterPerf[0] && (
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1rem' }}>
                <div className="card flat"><div className="card-title">Placements</div><div className="card-value">{recruiterPerf[0].placements}</div></div>
                <div className="card flat"><div className="card-title">Selected</div><div className="card-value">{recruiterPerf[0].selected ?? 0}</div></div>
                <div className="card flat"><div className="card-title">Total Candidates</div><div className="card-value">{recruiterPerf[0].total ?? 0}</div></div>
              </div>
            )}
            <table className="data-table" style={{ marginTop: '1rem' }}>
              <thead><tr><th>Recruiter</th><th>Placements</th><th>Selected</th><th>Total</th></tr></thead>
              <tbody>
                {recruiterPerf.map((r) => (
                  <tr key={r.name}><td>{r.name}</td><td>{r.placements}</td><td>{r.selected ?? 0}</td><td>{r.total ?? '—'}</td></tr>
                ))}
                {recruiterPerf.length === 0 && (
                  <tr><td colSpan={4} className="text-muted">No data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'funnel' && (
          <div className="card">
            <h3 className="card-heading">Recruitment Funnel</h3>
            <ResponsiveContainer width="100%" height={320}>
              <FunnelChart>
                <Tooltip />
                <Funnel dataKey="count" data={funnel} isAnimationActive>
                  <LabelList position="right" fill="#64748B" stroke="none" dataKey="stage" />
                  {funnel.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        )}

        {tab === 'offer' && offer && (
          <div className="card">
            <h3 className="card-heading">Offer Acceptance Rate</h3>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="card flat"><div className="card-title">Offers Sent</div><div className="card-value">{offer.offers}</div></div>
              <div className="card flat"><div className="card-title">Accepted</div><div className="card-value">{offer.accepted}</div></div>
              <div className="card flat"><div className="card-title">Rate</div><div className="card-value">{offer.acceptance_rate}%</div></div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
