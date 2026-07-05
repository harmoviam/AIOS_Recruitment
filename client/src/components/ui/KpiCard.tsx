import { Link } from 'react-router-dom';

interface KpiCardProps {
  title: string;
  value: string | number;
  meta?: string;
  metaVariant?: 'positive' | 'negative' | 'warning';
  href?: string;
}

export default function KpiCard({ title, value, meta, metaVariant = 'positive', href }: KpiCardProps) {
  const content = (
    <>
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      {meta && <div className={`card-meta${metaVariant !== 'positive' ? ` ${metaVariant}` : ''}`}>{meta}</div>}
    </>
  );

  if (href) {
    return (
      <Link to={href} className="card kpi-card-link">
        {content}
      </Link>
    );
  }

  return <div className="card">{content}</div>;
}
