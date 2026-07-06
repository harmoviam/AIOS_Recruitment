import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  assertCandidateInTenant,
  requireTenant,
  tenantClause,
  tenantMiddleware,
} from '../middleware/tenant.js';
import {
  closeOpenFollowUps,
  createNoResponseEscalation,
  syncFollowUps,
} from '../services/followUpEngine.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireTenant);

const tid = (req: Request) => req.tenant!.id;

function deriveStatus(dueAt: Date, status: string, completedAt: string | null): string {
  if (status === 'completed' || completedAt) return 'completed';
  if (status === 'missed') return 'missed';
  const now = new Date();
  const due = new Date(dueAt);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (due < dayStart && status !== 'completed') return 'overdue';
  if (due >= dayStart && due < dayEnd) return 'today';
  if (due >= dayEnd) return 'upcoming';
  return status;
}

router.get('/', async (req, res) => {
  const { status, assigned_to, category } = req.query;

  // Lazily generate rule-based follow-ups (interview reminders, offer chase,
  // onboarding milestones) so the center is always up to date.
  await syncFollowUps(tid(req));

  const t = tenantClause(tid(req), 'f', 1);
  let sql = `
    SELECT f.*, c.name AS candidate_name, c.phone AS candidate_phone, c.email AS candidate_email,
      c.stage AS candidate_stage, c.joined_at AS candidate_joined_at,
      c.expected_joining_at AS candidate_expected_joining_at,
      j.title AS job_title, u.name AS assignee_name,
      i.scheduled_at AS interview_at, i.round_type AS interview_round
    FROM follow_ups f
    JOIN candidates c ON c.id = f.candidate_id AND c.tenant_id = f.tenant_id
    LEFT JOIN jobs j ON j.id = c.job_id AND j.tenant_id = f.tenant_id
    LEFT JOIN users u ON u.id = f.assigned_to
    LEFT JOIN interviews i ON i.id = f.interview_id
    WHERE ${t.sql}
  `;
  const params: unknown[] = [t.param];
  let i = t.nextIndex;

  if (assigned_to) {
    sql += ` AND f.assigned_to = $${i++}`;
    params.push(Number(assigned_to));
  }

  if (category) {
    sql += ` AND f.category = $${i++}`;
    params.push(category);
  }

  if (req.user!.role === 'recruiter') {
    sql += ` AND c.recruiter_id = $${i++}`;
    params.push(req.user!.id);
  } else if (req.user!.role === 'hiring_manager') {
    sql += ` AND c.recruiter_id IN (
      SELECT r.id FROM users r WHERE r.tenant_id = $${i} AND r.role = 'recruiter'
      AND (r.managed_by_id = $${i + 1} OR r.company_id = (SELECT company_id FROM users WHERE id = $${i + 1}))
    )`;
    params.push(tid(req), req.user!.id);
    i += 2;
  }

  sql += ' ORDER BY f.due_at DESC';

  const { rows } = await pool.query(sql, params);
  const mapped = rows.map((r) => ({
    ...r,
    status: deriveStatus(r.due_at, r.status, r.completed_at),
  }));

  if (status) {
    res.json(mapped.filter((r) => r.status === status));
  } else {
    res.json(mapped);
  }
});

router.get('/counts', async (req, res) => {
  // Sync runs on GET / — avoid parallel sync here (caused duplicate rule rows).
  const t = tenantClause(tid(req), 'f', 1);
  let sql = `
    SELECT f.* FROM follow_ups f
    JOIN candidates c ON c.id = f.candidate_id AND c.tenant_id = f.tenant_id
    WHERE ${t.sql}
  `;
  const params: unknown[] = [t.param];
  let i = t.nextIndex;

  if (req.user!.role === 'recruiter') {
    sql += ` AND c.recruiter_id = $${i++}`;
    params.push(req.user!.id);
  } else if (req.user!.role === 'hiring_manager') {
    sql += ` AND c.recruiter_id IN (
      SELECT r.id FROM users r WHERE r.tenant_id = $${i} AND r.role = 'recruiter'
      AND (r.managed_by_id = $${i + 1} OR r.company_id = (SELECT company_id FROM users WHERE id = $${i + 1}))
    )`;
    params.push(tid(req), req.user!.id);
    i += 2;
  }

  const { rows } = await pool.query(sql, params);
  const counts = { today: 0, overdue: 0, upcoming: 0, completed: 0, missed: 0 };
  for (const r of rows) {
    const s = deriveStatus(r.due_at, r.status, r.completed_at);
    if (s in counts) counts[s as keyof typeof counts]++;
  }
  res.json(counts);
});

router.post('/', async (req, res) => {
  const { candidate_id, due_at, type, notes, ai_suggestion, assigned_to } = req.body;
  if (!candidate_id || !due_at) {
    return res.status(400).json({ error: 'candidate_id and due_at required' });
  }
  if (!(await assertCandidateInTenant(Number(candidate_id), tid(req)))) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const { rows } = await pool.query(
    `INSERT INTO follow_ups (tenant_id, candidate_id, assigned_to, due_at, type, status, notes, ai_suggestion, category)
     VALUES ($1, $2, $3, $4, $5, 'upcoming', $6, $7, 'manual') RETURNING *`,
    [
      tid(req),
      candidate_id,
      assigned_to || req.user!.id,
      due_at,
      type || 'call',
      notes || null,
      ai_suggestion || null,
    ]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { status, notes, due_at, completed, outcome, type } = req.body;

  const { rows: existingRows } = await pool.query(
    'SELECT * FROM follow_ups WHERE id = $1 AND tenant_id = $2',
    [req.params.id, tid(req)]
  );
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Follow-up not found' });

  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (status !== undefined) {
    updates.push(`status = $${i++}`);
    params.push(status);
  }
  if (notes !== undefined) {
    updates.push(`notes = $${i++}`);
    params.push(notes);
  }
  if (due_at !== undefined) {
    updates.push(`due_at = $${i++}`);
    params.push(due_at);
  }
  if (type !== undefined) {
    updates.push(`type = $${i++}`);
    params.push(type);
  }
  if (outcome !== undefined) {
    updates.push(`outcome = $${i++}`);
    params.push(outcome);
  }
  if (completed) {
    updates.push(`status = $${i++}`);
    params.push('completed');
    updates.push(`completed_at = NOW()`);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const idParam = i;
  const tenantParam = i + 1;
  params.push(req.params.id, tid(req));

  const { rows } = await pool.query(
    `UPDATE follow_ups SET ${updates.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam} RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Follow-up not found' });
  const updated = rows[0];

  // ── Rule side-effects driven by the recorded outcome ──────────────
  if (completed && outcome) {
    // Rule C: candidate not picking calls the day before / day of interview
    if (
      outcome === 'no_answer' &&
      ['interview_prep', 'interview_day', 'no_response'].includes(updated.category)
    ) {
      await createNoResponseEscalation(tid(req), updated);
    }

    // Rule B terminal answers: stop chasing, record why on the candidate
    if (['not_interested', 'joined_elsewhere', 'offer_rejected'].includes(outcome)) {
      await pool.query(
        'UPDATE candidates SET offer_status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [outcome, updated.candidate_id, tid(req)]
      );
      await closeOpenFollowUps(
        tid(req),
        updated.candidate_id,
        ['offer_followup', 'onboarding', 'no_response'],
        'auto_closed'
      );
    }

    // Rule D check-in statuses: keep the candidate's post-joining status current
    if (
      updated.category === 'onboarding' &&
      ['doing_well', 'issue_flagged', 'no_answer'].includes(outcome)
    ) {
      await pool.query(
        'UPDATE candidates SET offer_status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [outcome, updated.candidate_id, tid(req)]
      );
    }

    // Rule D terminal answer: joined candidate left the company
    if (outcome === 'left_company') {
      await pool.query(
        "UPDATE candidates SET offer_status = 'left_company', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [updated.candidate_id, tid(req)]
      );
      await closeOpenFollowUps(tid(req), updated.candidate_id, ['onboarding'], 'auto_closed');
    }

    await pool.query(
      'INSERT INTO activities (type, description, user_id, candidate_id, tenant_id) VALUES ($1, $2, $3, $4, $5)',
      [
        'follow_up',
        `Follow-up (${updated.category}) completed — outcome: ${outcome}`,
        req.user!.id,
        updated.candidate_id,
        tid(req),
      ]
    );
  }

  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM follow_ups WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    tid(req),
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Follow-up not found' });
  res.status(204).send();
});

export default router;
