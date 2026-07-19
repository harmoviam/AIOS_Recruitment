import { Router, type Request } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenant, tenantMiddleware } from '../middleware/tenant.js';

/**
 * Razorpay billing — same Orders + client Checkout + HMAC-verify pattern as
 * the FormJobSeeker payment kit (packages/course/routes/courses.js):
 *
 *   POST /api/billing/order   -> create Razorpay order for a plan/cycle
 *   POST /api/billing/verify  -> verify checkout signature, activate the plan
 *   GET  /api/billing         -> current plan state + payment history
 *
 * Amounts always come from the server-side catalog — never from the client.
 * Renewals extend from the later of now / current plan_expires_at, so paying
 * early never loses days.
 */

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

function adminOnly(req: Request, res: import('express').Response, next: import('express').NextFunction) {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Organization Admin access required' });
  }
  next();
}

// Prices in INR (annual = ~2 months free). GST handling stays inside Razorpay.
const PLAN_CATALOG: Record<string, { monthly: number; annual: number }> = {
  starter: { monthly: 4999, annual: 49990 },
  pro: { monthly: 14999, annual: 149990 },
};

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const missing = [
      !keyId ? 'RAZORPAY_KEY_ID' : null,
      !keySecret ? 'RAZORPAY_KEY_SECRET' : null,
    ].filter(Boolean);
    const error = new Error(`Missing Razorpay config: ${missing.join(', ')}`) as Error & {
      statusCode?: number;
    };
    error.statusCode = 503;
    throw error;
  }
  return { client: new Razorpay({ key_id: keyId, key_secret: keySecret }), keyId, keySecret };
}

export function billingMode(): 'live' | 'disabled' {
  return process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? 'live' : 'disabled';
}

router.get('/', async (req, res) => {
  const { rows: tenantRows } = await pool.query(
    `SELECT plan, status, trial_ends_at, plan_expires_at, gstin FROM tenants WHERE id = $1`,
    [tid(req)]
  );
  const { rows: payments } = await pool.query(
    `SELECT id, plan, cycle, amount_inr, status, period_start, period_end, paid_at, created_at
     FROM billing_payments WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [tid(req)]
  );
  res.json({
    mode: billingMode(),
    ...tenantRows[0],
    payments,
  });
});

router.post('/order', adminOnly, async (req, res) => {
  const plan = String(req.body?.plan || '');
  const cycle = req.body?.cycle === 'annual' ? 'annual' : 'monthly';
  const catalog = PLAN_CATALOG[plan];
  if (!catalog) {
    return res.status(400).json({ error: 'Invalid plan. Choose starter or pro (enterprise is sales-led).' });
  }

  try {
    const { client, keyId } = getRazorpayClient();
    const amountInr = catalog[cycle];
    const receipt = `hr_${tid(req)}_${Date.now()}`;

    const order = await client.orders.create({
      amount: Math.round(amountInr * 100),
      currency: 'INR',
      receipt,
      payment_capture: true,
      notes: {
        tenantId: String(tid(req)),
        tenantSlug: req.tenant!.slug,
        plan,
        cycle,
      },
    });

    await pool.query(
      `INSERT INTO billing_payments (tenant_id, razorpay_order_id, plan, cycle, amount_inr, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'created', $6)`,
      [tid(req), order.id, plan, cycle, amountInr, req.user!.id]
    );

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      plan,
      cycle,
      tenantName: req.tenant!.name,
    });
  } catch (error) {
    const err = error as Error & { statusCode?: number; error?: { description?: string } };
    console.error('Create billing order error:', err.message);
    res
      .status(err.statusCode || 500)
      .json({ error: err.error?.description || err.message || 'Failed to create payment order' });
  }
});

router.post('/verify', adminOnly, async (req, res) => {
  const {
    razorpay_payment_id: paymentId,
    razorpay_order_id: orderId,
    razorpay_signature: signature,
  } = req.body || {};
  if (!paymentId || !orderId || !signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const { rows: orders } = await pool.query(
    `SELECT * FROM billing_payments WHERE razorpay_order_id = $1 AND tenant_id = $2`,
    [orderId, tid(req)]
  );
  const payment = orders[0];
  if (!payment) return res.status(404).json({ error: 'Order not found' });
  if (payment.status === 'paid') {
    return res.json({ activated: true, plan: payment.plan, period_end: payment.period_end });
  }

  try {
    const { keySecret } = getRazorpayClient();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    if (expectedSignature !== signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    return res.status(err.statusCode || 500).json({ error: err.message });
  }

  // Extend from the later of now / current expiry so early renewals stack.
  const { rows: tenantRows } = await pool.query(
    'SELECT plan_expires_at FROM tenants WHERE id = $1',
    [tid(req)]
  );
  const base =
    tenantRows[0]?.plan_expires_at && new Date(tenantRows[0].plan_expires_at) > new Date()
      ? new Date(tenantRows[0].plan_expires_at)
      : new Date();
  const periodEnd = new Date(base);
  if (payment.cycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE billing_payments
       SET status = 'paid', razorpay_payment_id = $1, paid_at = NOW(), period_start = $2, period_end = $3
       WHERE id = $4`,
      [paymentId, base.toISOString(), periodEnd.toISOString(), payment.id]
    );
    await client.query(
      `UPDATE tenants SET plan = $1, status = 'active', plan_expires_at = $2 WHERE id = $3`,
      [payment.plan, periodEnd.toISOString(), tid(req)]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ activated: true, plan: payment.plan, period_end: periodEnd.toISOString() });
});

router.patch('/gstin', adminOnly, async (req, res) => {
  const gstin = String(req.body?.gstin || '').trim().toUpperCase();
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
    return res.status(400).json({ error: 'Invalid GSTIN format' });
  }
  await pool.query('UPDATE tenants SET gstin = $1 WHERE id = $2', [gstin || null, tid(req)]);
  res.json({ gstin: gstin || null });
});

export default router;
