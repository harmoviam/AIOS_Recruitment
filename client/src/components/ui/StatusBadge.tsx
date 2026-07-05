import { STAGE_COLORS } from '../../data/mock';

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const color = STAGE_COLORS[status.toLowerCase()] || '#64748B';
  const text = label || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');

  return (
    <span className="status-badge" style={{ '--badge-color': color } as React.CSSProperties}>
      <span className="status-dot" />
      {text}
    </span>
  );
}
