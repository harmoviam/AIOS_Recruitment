import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client';
import type { SourcingDashboardSummary } from '../../types/sourcing';

// Categorical palette validated for CVD separation & contrast (fixed order, never cycled)
const CATEGORICAL = ['#4f46e5', '#0d9488', '#ea580c', '#be185d', '#65a30d', '#0369a1'];
const AXIS_TICK = { fontSize: 11, fill: '#666b85' };

export default function SourcingDashboardPage() {
  const [summary, setSummary] = useState<SourcingDashboardSummary | null>(null);
  const [sourceChart, setSourceChart] = useState<{ name: string; applications: number; joinings: number }[]>([]);
  const [cityChart, setCityChart] = useState<{ name: string; value: number }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.sourcingDashboardSummary(),
      api.sourcingChart('source-performance') as Promise<{
        categories: string[];
        series: Array<{ name: string; data: number[] }>;
      }>,
      api.sourcingChart('city-distribution') as Promise<Array<{ name: string; value: number }>>,
    ])
      .then(([s, src, city]) => {
        setSummary(s);
        setSourceChart(
          (src.categories || []).map((name, i) => ({
            name,
            applications: src.series?.find((x) => x.name === 'Applications')?.data[i] ?? 0,
            joinings: src.series?.find((x) => x.name === 'Joinings')?.data[i] ?? 0,
          }))
        );
        setCityChart((city || []).slice(0, 6));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <>
        <div className="topbar"><div className="search-bar">Sourcing Dashboard</div></div>
        <div className="page-content"><div className="alert-banner danger">{error}</div></div>
      </>
    );
  }

  if (loading || !summary) {
    return (
      <>
        <div className="topbar"><div className="search-bar">Sourcing Dashboard</div></div>
        <div className="page-content"><p className="empty-inline">Loading sourcing dashboard…</p></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar"><div className="search-bar">Sourcing Dashboard</div></div>
      <div className="page-content">
        <h1 className="section-title">Sourcing Dashboard</h1>
        <p className="section-description">
          Funnel performance across your sourcing channels, cities, and campaigns.
        </p>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="card"><div className="card-title">Applications</div><div className="card-value">{summary.applications.toLocaleString()}</div></div>
          <div className="card"><div className="card-title">Interviews</div><div className="card-value">{summary.interviews.toLocaleString()}</div></div>
          <div className="card"><div className="card-title">Joinings</div><div className="card-value">{summary.joinings.toLocaleString()}</div></div>
          <div className="card"><div className="card-title">Conversion</div><div className="card-value">{summary.conversionPct}%</div></div>
        </div>

        <div className="section-split" style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <div className="card-title">Source Performance</div>
            {sourceChart.length === 0 ? (
              <p className="empty-inline">No activity logged yet. Log outcomes on the Channels page to see performance.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sourceChart} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6e8f2" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={AXIS_TICK}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    tickLine={false}
                    axisLine={{ stroke: '#e6e8f2' }}
                  />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(79, 70, 229, 0.06)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="applications" name="Applications" fill={CATEGORICAL[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="joinings" name="Joinings" fill={CATEGORICAL[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card">
            <div className="card-title">City Distribution</div>
            {cityChart.length === 0 ? (
              <p className="empty-inline">No city data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={cityChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {cityChart.map((_, i) => (
                      <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="section-split" style={{ marginTop: '1.25rem' }}>
          <div className="card table-wrap">
            <div className="card-title">Top Sources</div>
            {summary.topSources.length === 0 ? (
              <p className="empty-inline">No scored sources yet — log recruiter activity to start learning.</p>
            ) : (
              <table className="data-table compact">
                <thead>
                  <tr><th>Source</th><th>Score</th><th>Joinings</th></tr>
                </thead>
                <tbody>
                  {summary.topSources.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.score.toFixed(1)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.joinings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card table-wrap">
            <div className="card-title">Top Campaigns</div>
            {summary.topCampaigns.length === 0 ? (
              <p className="empty-inline">No campaigns yet — create one from Find Sources.</p>
            ) : (
              <table className="data-table compact">
                <thead>
                  <tr><th>Campaign</th><th>Hires</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {summary.topCampaigns.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.hiringCount}</td>
                      <td>
                        <span className="status-badge">
                          <span className="status-dot" />
                          {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
