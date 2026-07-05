import { TENANT_PLANS } from '../../data/tenants';
import type { TenantPlan, TenantStatus } from '../../types';

interface PlanBadgeProps {
  plan: TenantPlan;
  status?: TenantStatus;
}

export default function PlanBadge({ plan, status }: PlanBadgeProps) {
  const label = TENANT_PLANS[plan].label;
  const statusLabel = status === 'trial' ? 'Trial' : status === 'suspended' ? 'Suspended' : null;

  return (
    <span className={`plan-badge plan-${plan}${status === 'trial' ? ' trial' : ''}`}>
      {label}
      {statusLabel && <span className="plan-status">{statusLabel}</span>}
    </span>
  );
}
