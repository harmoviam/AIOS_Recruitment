import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../../components/ui/TopBar';
import PageHeader from '../../components/ui/PageHeader';
import PlanBadge from '../../components/ui/PlanBadge';
import { useTenant } from '../../context/TenantContext';
import { TENANT_PLANS } from '../../data/tenants';
import { api } from '../../api/client';
import type { BillingInfo } from '../../types';

const PLANS = [
  { id: 'starter' as const, monthly: 4999, highlights: ['3 recruiters', '2K candidates', 'WhatsApp inbox'] },
  { id: 'pro' as const, monthly: 14999, highlights: ['15 recruiters', '25K candidates', 'AI insights', 'Automation'], popular: true },
  { id: 'enterprise' as const, monthly: null, highlights: ['Unlimited', 'SSO & API', 'White-label', 'Dedicated support'] },
];

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

// Same lazy checkout.js loader as the FormJobSeeker payment kit.
const loadRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function BillingPage() {
  const { tenant } = useTenant();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstinSaved, setGstinSaved] = useState(false);

  const reload = () =>
    api
      .getBilling()
      .then((b) => {
        setBilling(b);
        setGstin(b.gstin || '');
      })
      .catch(() => setBilling(null));

  useEffect(() => {
    reload();
  }, []);

  const priceLabel = (monthly: number | null) => {
    if (monthly == null) return 'Custom';
    if (cycle === 'annual') return `₹${(monthly * 10).toLocaleString('en-IN')}/yr`;
    return `₹${monthly.toLocaleString('en-IN')}/mo`;
  };

  const upgrade = async (planId: string) => {
    setError('');
    setSuccess('');
    setBusyPlan(planId);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error('Could not load Razorpay checkout. Check your connection.');

      const order = await api.createBillingOrder(planId, cycle);

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'HarmiRecruit',
          description: `${TENANT_PLANS[planId as keyof typeof TENANT_PLANS]?.label || planId} plan — ${cycle}`,
          order_id: order.orderId,
          notes: { tenant: order.tenantName },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const result = await api.verifyBillingPayment(response);
              setSuccess(
                `Payment successful — ${result.plan} plan active until ${new Date(result.period_end).toLocaleDateString('en-IN')}. Refresh to see the new plan everywhere.`
              );
              reload();
              resolve();
            } catch (err) {
              reject(err as Error);
            }
          },
          modal: { ondismiss: () => resolve() },
          theme: { color: '#2563EB' },
        });
        rzp.open();
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyPlan(null);
    }
  };

  const saveGstin = async () => {
    setError('');
    try {
      await api.updateGstin(gstin);
      setGstinSaved(true);
      setTimeout(() => setGstinSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const billingDisabled = billing?.mode === 'disabled';

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Billing' }]} />
      <div className="page-content">
        <PageHeader title="Billing & Plan" description="Manage subscription and usage for your organization." />

        <div className="alert-banner info">
          Current plan: <PlanBadge plan={tenant.plan} status={tenant.status} />
          {billing?.status === 'trial' && billing.trial_ends_at && (
            <span> — Trial ends {new Date(billing.trial_ends_at).toLocaleDateString('en-IN')}</span>
          )}
          {billing?.plan_expires_at && billing.status === 'active' && (
            <span> — Renews / expires {new Date(billing.plan_expires_at).toLocaleDateString('en-IN')}</span>
          )}
        </div>

        {billingDisabled && (
          <div className="alert-banner" style={{ marginTop: '0.75rem' }}>
            Online payments are not configured on this server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).
            Contact support to activate a plan.
          </div>
        )}
        {error && <div className="form-error" style={{ marginTop: '0.75rem' }}>{error}</div>}
        {success && (
          <div className="alert-banner info" style={{ marginTop: '0.75rem' }}>
            {success}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
          <button
            type="button"
            className={`button-pill ${cycle === 'monthly' ? 'button-primary' : 'button-secondary'}`}
            onClick={() => setCycle('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`button-pill ${cycle === 'annual' ? 'button-primary' : 'button-secondary'}`}
            onClick={() => setCycle('annual')}
          >
            Annual (2 months free)
          </button>
        </div>

        <div className="plan-grid">
          {PLANS.map((p) => (
            <div key={p.id} className={`plan-card${p.id === tenant.plan ? ' current' : ''}${p.popular ? ' popular' : ''}`}>
              {p.popular && <span className="plan-popular-tag">Most popular</span>}
              <h3>{TENANT_PLANS[p.id].label}</h3>
              <div className="plan-price">{priceLabel(p.monthly)}</div>
              <ul className="plan-features">
                {p.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {p.id === tenant.plan && billing?.status === 'active' ? (
                <button type="button" className="button-pill button-secondary" disabled>Current plan</button>
              ) : p.monthly == null ? (
                <a className="button-pill button-secondary" href="mailto:sales@harmirecruit.com?subject=Enterprise plan">
                  Contact sales
                </a>
              ) : (
                <button
                  type="button"
                  className="button-pill button-primary"
                  disabled={billingDisabled || busyPlan !== null}
                  onClick={() => upgrade(p.id)}
                >
                  {busyPlan === p.id ? 'Opening checkout…' : p.id === tenant.plan ? 'Renew' : 'Upgrade'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 className="card-heading">Usage this period</h3>
          <div className="usage-bars">
            <div>
              <span>Recruiters: {tenant.usersCount} / {TENANT_PLANS[tenant.plan].recruiters}</span>
              <div className="usage-track"><div className="usage-fill" style={{ width: `${Math.min(100, (tenant.usersCount / TENANT_PLANS[tenant.plan].recruiters) * 100)}%` }} /></div>
            </div>
            <div>
              <span>Candidates: {tenant.candidatesCount.toLocaleString()} / {TENANT_PLANS[tenant.plan].candidates.toLocaleString()}</span>
              <div className="usage-track"><div className="usage-fill" style={{ width: `${Math.min(100, (tenant.candidatesCount / TENANT_PLANS[tenant.plan].candidates) * 100)}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 className="card-heading">GST details</h3>
          <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
            Add your GSTIN so it appears on payment invoices.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input-field"
              style={{ maxWidth: '280px' }}
              placeholder="e.g. 03ABCDE1234F1Z5"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
            />
            <button type="button" className="button-pill button-secondary" onClick={saveGstin}>
              {gstinSaved ? 'Saved ✓' : 'Save GSTIN'}
            </button>
          </div>
        </div>

        {billing && billing.payments.length > 0 && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h3 className="card-heading">Payment history</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Plan</th>
                  <th>Cycle</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {billing.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleDateString('en-IN')}</td>
                    <td>{p.plan}</td>
                    <td>{p.cycle}</td>
                    <td>₹{Number(p.amount_inr).toLocaleString('en-IN')}</td>
                    <td>{p.status}</td>
                    <td>
                      {p.period_end
                        ? `until ${new Date(p.period_end).toLocaleDateString('en-IN')}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-muted" style={{ marginTop: '1rem' }}>
          <Link to="/settings/organization">← Organization settings</Link>
        </p>
      </div>
    </>
  );
}
