import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '../../api/client';
import type { SourcingDashboardSummary } from '../../types/sourcing';

const COLORS = ['#2563EB', '#0D9488', '#EA580C', '#7C3AED', '#CA8A04', '#DC2626'];

export default function SourcingDashboardPage() {
  const [summary, setSummary] = useState<SourcingDashboardSummary | null>(null);
  const [sourceChart, setSourceChart] = useState<{ name: string; applications: number; joinings: number }[]>([]);
  const [cityChart, setCityChart] = useState<{ name: string; value: number }[]>([]);
  const [error, setError] = useState('');

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
        setCityChart(city || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="page-content"><div className="alert alert-error">{error}</div></div>;
  if (!summary) return <div className="page-content">Loading sourcing dashboard…</div>;

  return (
    <>
      <div className="topbar"><div className="search-bar">Sourcing Dashboard</div></div>
      <div className="page-content">
        <h1 className="section-title">Sourcing Intelligence Dashboard</h1>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="card"><div className="card-title">Applications</div><div className="card-value">{summary.applications}</div></div>
          <div className="card"><div className="card-title">Interviews</div><div className="card-value">{summary.interviews}</div></div>
          <div className="card"><div className="card-title">Joinings</div><div className="card-value">{summary.joinings}</div></div>
          <div className="card"><div className="card-title">Conversion %</div><div className="card-value">{summary.conversionPct}</div></div>
        </div>

        <div className="section-split" style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <div className="card-title">Source Performance</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sourceChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="applications" fill="#2563EB" name="Applications" />
                <Bar dataKey="joinings" fill="#0D9488" name="Joinings" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <div className="card-title">City Distribution</div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={cityChart} dataKey="value" nameKey="name" outerRadius={90} label>
                  {cityChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section-split" style={{ marginTop: '1rem' }}>
          <div className="card">
            <div className="card-title">Top Sources</div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {summary.topSources.map((s) => (
                <li key={s.id}>{s.name} — score {s.score.toFixed(1)}, joinings {s.joinings}</li>
              ))}
              {summary.topSources.length === 0 && <li>No scored sources yet — log activities to learn.</li>}
            </ul>
          </div>
          <div className="card">
            <div className="card-title">Top Campaigns</div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {summary.topCampaigns.map((c) => (
                <li key={c.id}>{c.name} ({c.hiringCount} hires) — {c.status}</li>
              ))}
              {summary.topCampaigns.length === 0 && <li>No campaigns yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
