import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import KpiCard from '../components/ui/KpiCard';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import TopBar from '../components/ui/TopBar';
import type { ResumeDashboardResponse } from '../types';

type Period = 'all' | '7' | '30' | '90' | 'custom';

const CHART_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#64748B', '#EC4899'];

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function presetRange(period: Period): { from?: string; to?: string } {
  if (period === 'all' || period === 'custom') return {};
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (Number(period) - 1));
  return { from: localDate(from), to: localDate(to) };
}

export default function ResumeDashboardPage() {
  const [data, setData] = useState<ResumeDashboardResponse | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (params: { from?: string; to?: string }) => {
    setLoading(true);
    setError('');
    try {
      setData(await api.getResumeDashboard(params));
    } catch (err) {
      setError((err as Error).message || 'Unable to load resume dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const choosePeriod = (next: Period) => {
    setPeriod(next);
    if (next !== 'custom') setRange(presetRange(next));
  };

  const jobChart = useMemo(
    () => (data?.byJob || []).slice(0, 12).map((row) => ({ ...row, label: row.jobTitle.length > 22 ? `${row.jobTitle.slice(0, 21)}…` : row.jobTitle })),
    [data]
  );

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Resume Dashboard' }]} />
      <div className="page-content">
        <PageHeader
          title="Resume Analytics"
          description="Uploaded-resume coverage by job, candidate status, hiring manager, and recruiter."
          actions={
            <div className="resume-period-controls" aria-label="Resume dashboard date range">
              {(['all', '7', '30', '90', 'custom'] as Period[]).map((item) => (
                <button key={item} type="button" className={`period-filter-btn${period === item ? ' active' : ''}`} onClick={() => choosePeriod(item)}>
                  {item === 'all' ? 'All time' : item === 'custom' ? 'Custom' : `${item} days`}
                </button>
              ))}
            </div>
          }
        />

        {period === 'custom' && (
          <div className="card resume-custom-range">
            <label>From <input className="input-field" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
            <label>To <input className="input-field" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
            <button
              type="button"
              className="button-pill button-primary"
              disabled={(!customFrom && !customTo) || (!!customFrom && !!customTo && customFrom > customTo)}
              onClick={() => setRange({ from: customFrom || undefined, to: customTo || undefined })}
            >
              Apply range
            </button>
          </div>
        )}

        {error && <div className="card form-error">{error}</div>}
        {loading && !data ? <div className="card empty-inline">Loading resume analytics…</div> : (
          <>
            <div className="kpi-grid">
              <KpiCard title="Uploaded Resumes" value={data?.totals.resumes ?? 0} meta={period === 'all' ? 'All time' : 'Selected period'} />
              <KpiCard title="Jobs Represented" value={data?.totals.jobs ?? 0} />
              <KpiCard title="Hiring Managers" value={data?.totals.hiringManagers ?? 0} />
              <KpiCard title="Recruiters" value={data?.totals.recruiters ?? 0} />
            </div>

            <div className="dashboard-grid resume-dashboard-grid">
              <section className="card">
                <div className="card-header-row">
                  <h2 className="card-heading">Resumes by Job</h2>
                  <span className="text-muted">Top {Math.min(jobChart.length, 12)} jobs</span>
                </div>
                {jobChart.length === 0 ? <p className="empty-inline">No uploaded resumes in this period.</p> : (
                  <ResponsiveContainer width="100%" height={Math.max(260, jobChart.length * 36)}>
                    <BarChart data={jobChart} layout="vertical" margin={{ left: 12, right: 28 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={155} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [value, 'Resumes']} labelFormatter={(_, payload) => payload[0]?.payload?.jobTitle || ''} />
                      <Bar dataKey="count" fill="var(--primary)" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </section>

              <section className="card">
                <h2 className="card-heading">Overall Resume Status</h2>
                {(data?.byStatus.length ?? 0) === 0 ? <p className="empty-inline">No status data available.</p> : (
                  <>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={data!.byStatus} dataKey="count" nameKey="status" innerRadius={58} outerRadius={92} paddingAngle={2}>
                          {data!.byStatus.map((row, index) => <Cell key={row.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => [value, 'Resumes']} />
                        <Legend formatter={(value) => String(value).replace(/_/g, ' ')} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="resume-status-list">
                      {data!.byStatus.map((row) => <div key={row.status}><StatusBadge status={row.status} /><strong>{row.count}</strong></div>)}
                    </div>
                  </>
                )}
              </section>
            </div>

            <section className="card">
              <div className="card-header-row">
                <h2 className="card-heading">Hiring Manager and Recruiter Resume Counts</h2>
                <span className="text-muted">Every uploaded resume is included, including unassigned ownership.</span>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Hiring Manager</th><th>Team Resumes</th><th>Recruiter / Direct Ownership</th><th>Resumes</th></tr></thead>
                  <tbody>
                    {(data?.byManager || []).flatMap((manager) => manager.recruiters.map((recruiter, index) => (
                      <tr key={`${manager.hiringManagerId ?? 'none'}-${recruiter.recruiterId ?? recruiter.recruiterName}`}>
                        {index === 0 && <td rowSpan={manager.recruiters.length}><strong>{manager.hiringManagerName}</strong></td>}
                        {index === 0 && <td rowSpan={manager.recruiters.length}><strong>{manager.count}</strong></td>}
                        <td>{recruiter.recruiterName}</td>
                        <td>{recruiter.count}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
                {(data?.byManager.length ?? 0) === 0 && <p className="empty-inline">No uploaded resumes in this period.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
