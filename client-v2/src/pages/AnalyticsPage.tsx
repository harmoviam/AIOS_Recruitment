import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { api } from '../api/client';

interface AnalyticsData {
  kpis: Record<string, number>;
  funnel: { stage: string; count: number }[];
  recruiterPerformance: { name: string; placements: number; total: number }[];
  monthlyPlacements: { month: string; placements: number }[];
  sourceConversion: { source: string; total: number; converted: number; rate: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    api.getAnalytics().then((d) => setData(d as unknown as AnalyticsData));
  }, []);

  if (!data) return <div className="page-content">Loading analytics…</div>;

  const { kpis } = data;

  return (
    <>
      <div className="topbar">
        <div className="search-bar">Analytics Dashboard</div>
      </div>
      <div className="page-content">
        <h1 className="section-title">Analytics & Insights</h1>
        <p className="section-description">Executive metrics with recruiter performance and funnel reports.</p>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="card">
            <div className="card-title">Total Placements</div>
            <div className="card-value">{kpis.totalPlacements}</div>
          </div>
          <div className="card">
            <div className="card-title">Conversion Rate</div>
            <div className="card-value">{kpis.conversionRate}%</div>
          </div>
          <div className="card">
            <div className="card-title">Avg Time-to-Hire</div>
            <div className="card-value">{kpis.avgTimeToHire}d</div>
          </div>
          <div className="card">
            <div className="card-title">Interview Success</div>
            <div className="card-value">{kpis.interviewSuccess}%</div>
          </div>
        </div>

        <div className="section-split" style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <div className="card-title">Recruiter Performance</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.recruiterPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="placements" fill="#6366f1" name="Placements" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <div className="card-title">Hiring Funnel</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.funnel}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#ec4899" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section-split" style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <div className="card-title">Source-wise Conversion</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.sourceConversion}>
                <XAxis dataKey="source" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="rate" fill="#10b981" name="Conversion %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <div className="card-title">Monthly Placements</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.monthlyPlacements}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="placements" stroke="#6366f1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
