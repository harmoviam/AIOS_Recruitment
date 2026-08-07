import { Router, type Request } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  campaignCreateSchema,
  campaignSourceAttachSchema,
  campaignUpdateSchema,
} from '../../dto/sourcing/masters.js';
import * as campaignRepo from '../../repositories/sourcing/campaignRepository.js';
import { actorLabel, requireSourcingRead, requireSourcingWrite } from '../../services/sourcing/access.js';
import { handleSourcingError } from '../../services/sourcing/httpErrors.js';
import { parseListQuery, toPageResult } from '../../services/sourcing/pagination.js';

const router = Router();
const tid = (req: Request) => req.tenant!.id;
const idParam = z.string().uuid();

/** The careers-page job created from this campaign, if any (newest wins). */
async function getPublishedJob(tenantId: number, campaignId: string) {
  const { rows } = await pool.query(
    `SELECT id, title, status FROM jobs
     WHERE tenant_id = $1 AND sourcing_campaign_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, campaignId]
  );
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), title: String(rows[0].title), status: String(rows[0].status) };
}

async function withPublishedJob<T extends { id: string }>(tenantId: number, campaign: T) {
  return { ...campaign, publishedJob: await getPublishedJob(tenantId, campaign.id) };
}

router.get(
  '/',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const query = parseListQuery(req.query);
      const mine = req.query.mine === 'true';
      const { items, total } = await campaignRepo.listCampaigns(
        tid(req),
        query,
        mine ? req.user!.id : undefined
      );
      res.json(toPageResult(items, total, query));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/:id',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const row = await campaignRepo.getCampaignById(tid(req), idParam.parse(req.params.id));
      if (!row) return res.status(404).json({ error: 'Campaign not found' });
      res.json(await withPublishedJob(tid(req), row));
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.get(
  '/:id/checklist',
  requireSourcingRead,
  asyncHandler(async (req, res) => {
    try {
      const row = await campaignRepo.getCampaignById(tid(req), idParam.parse(req.params.id));
      if (!row) return res.status(404).json({ error: 'Campaign not found' });
      res.json({
        campaignId: row.id,
        items: [
          { step: 1, action: 'Confirm Top sources and priorities', done: row.sources.length > 0 },
          { step: 2, action: 'Generate channel content (FB/WA/LI)', done: false },
          { step: 3, action: 'Post / share on P1–P3 sources', done: false },
          { step: 4, action: 'Start calling script for warm leads', done: false },
          { step: 5, action: 'Log applications and interview outcomes', done: false },
          { step: 6, action: 'Follow up no-shows and offer drops', done: false },
        ],
      });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const body = campaignCreateSchema.parse(req.body);
      const row = await campaignRepo.createCampaign(tid(req), req.user!.id, body, actorLabel(req));
      res.status(201).json(row);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.put(
  '/:id',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const existing = await campaignRepo.getCampaignById(tid(req), id);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });
      const body = campaignUpdateSchema.parse(req.body);
      const updated = await campaignRepo.updateCampaign(tid(req), id, body);
      res.json(updated ? await withPublishedJob(tid(req), updated) : updated);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.patch(
  '/:id',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const existing = await campaignRepo.getCampaignById(tid(req), id);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });
      const body = campaignUpdateSchema.parse(req.body);
      const updated = await campaignRepo.updateCampaign(tid(req), id, body);
      res.json(updated ? await withPublishedJob(tid(req), updated) : updated);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.delete(
  '/:id',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const deleted = await campaignRepo.deleteCampaign(tid(req), idParam.parse(req.params.id));
      if (!deleted) return res.status(404).json({ error: 'Campaign not found' });
      res.json({ ok: true });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.post(
  '/:id/sources',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const existing = await campaignRepo.getCampaignById(tid(req), id);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });
      const body = campaignSourceAttachSchema.parse(req.body);
      const updated = await campaignRepo.attachCampaignSource(tid(req), id, body, actorLabel(req));
      res.json(updated ? await withPublishedJob(tid(req), updated) : updated);
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

/**
 * Publish a campaign to the tenant's public careers page by creating a linked
 * job. Only public-safe fields go into the posting — never notes, targets, or
 * channel strategy. Idempotent: re-publishing returns the existing active job.
 */
router.post(
  '/:id/publish',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const id = idParam.parse(req.params.id);
      const tenantId = tid(req);
      const campaign = await campaignRepo.getCampaignById(tenantId, id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const publicPath = (jobId: number) => `/careers/${req.tenant!.slug}/jobs/${jobId}`;

      const existing = await getPublishedJob(tenantId, id);
      if (existing && existing.status === 'active') {
        return res.json({ job: existing, publicPath: publicPath(existing.id), created: false });
      }

      const [{ rows: roleRows }, { rows: cityRows }] = await Promise.all([
        pool.query(`SELECT name FROM sourcing_role WHERE tenant_id = $1 AND id = $2`, [
          tenantId,
          campaign.roleId,
        ]),
        pool.query(`SELECT name FROM sourcing_city WHERE tenant_id = $1 AND id = $2`, [
          tenantId,
          campaign.cityId,
        ]),
      ]);
      const roleTitle = roleRows[0]?.name ? String(roleRows[0].name) : campaign.name;
      const cityLabel = cityRows[0]?.name ? String(cityRows[0].name) : '';

      const lines = [`We are hiring for ${roleTitle}${cityLabel ? ` in ${cityLabel}` : ''}.`];
      if (campaign.salaryMin != null || campaign.salaryMax != null) {
        const min = campaign.salaryMin != null ? `₹${campaign.salaryMin.toLocaleString('en-IN')}` : '';
        const max = campaign.salaryMax != null ? `₹${campaign.salaryMax.toLocaleString('en-IN')}` : '';
        lines.push(`Salary: ${min && max ? `${min} – ${max}` : min || `up to ${max}`} per month.`);
      }
      if (campaign.shiftType) lines.push(`Shift: ${campaign.shiftType}.`);
      if (campaign.joiningTimelineDays != null) {
        lines.push(`Immediate joining preferred (within ${campaign.joiningTimelineDays} days).`);
      }
      lines.push('Apply with your details and resume — our recruitment team will contact you.');

      const { rows: created } = await pool.query(
        `INSERT INTO jobs (title, client, location, status, open_positions, description,
           tenant_id, sourcing_campaign_id)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
         RETURNING id, title, status`,
        [
          roleTitle,
          req.tenant!.name,
          cityLabel || 'India',
          campaign.hiringCount,
          lines.join('\n\n'),
          tenantId,
          id,
        ]
      );
      const job = {
        id: Number(created[0].id),
        title: String(created[0].title),
        status: String(created[0].status),
      };
      res.status(201).json({ job, publicPath: publicPath(job.id), created: true });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

router.delete(
  '/:id/sources/:sourceId',
  requireSourcingWrite,
  asyncHandler(async (req, res) => {
    try {
      const ok = await campaignRepo.detachCampaignSource(
        tid(req),
        idParam.parse(req.params.id),
        idParam.parse(req.params.sourceId)
      );
      if (!ok) return res.status(404).json({ error: 'Campaign source not found' });
      res.json({ ok: true });
    } catch (err) {
      handleSourcingError(res, err);
    }
  })
);

export default router;
