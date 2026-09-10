import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { pool } from './db.js';
import { initDb } from './db.js';
import { loadTenantBySlug, publicTenantLogoUrl } from './middleware/tenant.js';
import authRoutes from './routes/auth.js';
import candidateRoutes from './routes/candidates.js';
import jobRoutes from './routes/jobs.js';
import interviewRoutes from './routes/interviews.js';
import interviewJoinRoutes from './routes/interviewJoin.js';
import messageRoutes from './routes/messages.js';
import activityRoutes from './routes/activities.js';
import analyticsRoutes from './routes/analytics.js';
import settingsRoutes from './routes/settings.js';
import platformRoutes from './routes/platform.js';
import tenantRoutes from './routes/tenant.js';
import followUpRoutes from './routes/followUps.js';
import companyRoutes from './routes/companies.js';
import hiringManagerRoutes from './routes/hiringManagers.js';
import recruiterRoutes from './routes/recruiters.js';
import organizationRoutes from './routes/organization.js';
import reportRoutes from './routes/reports.js';
import whatsappWebhookRoutes from './routes/whatsappWebhook.js';
import notificationRoutes from './routes/notifications.js';
import applicationRoutes from './routes/applications.js';
import publicRoutes from './routes/public.js';
import billingRoutes from './routes/billing.js';
import pollRoutes from './routes/poll.js';
import readinessRoutes from './routes/readiness.js';
import sourcingRoutes from './routes/sourcing/index.js';
import aiSourcingRoutes from './routes/aiSourcing/index.js';
import agentRoutes from './routes/agent.js';
import { startHarmoviaCandidateSyncWorker } from './services/harmoviaCandidateSync.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3010;
const APP_URL = process.env.APP_PUBLIC_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/interviews/join', interviewJoinRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/hiring-managers', hiringManagerRoutes);
app.use('/api/recruiters', recruiterRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/whatsapp', whatsappWebhookRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/readiness', readinessRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/poll', pollRoutes);
app.use('/api/sourcing', sourcingRoutes);
app.use('/api/ai-sourcing', aiSourcingRoutes);
app.use('/api/agent', agentRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin/',
    'Disallow: /login/',
    '',
    `Sitemap: ${APP_URL}/sitemap.xml`,
  ].join('\n'));
});

app.get('/sitemap.xml', async (_req, res) => {
  try {
    const { rows: tenants } = await pool.query(
      `SELECT slug FROM tenants WHERE status = 'active'`
    );
    const urls: string[] = [];
    for (const tenant of tenants) {
      urls.push(`<url><loc>${APP_URL}/careers/${tenant.slug}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
      const { rows: jobs } = await pool.query(
        `SELECT id FROM jobs WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1) AND status = 'active'`,
        [tenant.slug]
      );
      for (const job of jobs) {
        urls.push(`<url><loc>${APP_URL}/careers/${tenant.slug}/jobs/${job.id}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
      }
    }
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    res.type('application/xml');
    res.send(sitemap);
  } catch {
    res.status(500).json({ error: 'Failed to generate sitemap' });
  }
});

interface TenantMeta {
  name: string;
  slug: string;
  logo_url: string | null;
}

async function fetchTenantMeta(slug: string): Promise<TenantMeta | null> {
  try {
    const tenant = await loadTenantBySlug(slug);
    if (!tenant) return null;
    return {
      name: tenant.name,
      slug: tenant.slug,
      logo_url: publicTenantLogoUrl(tenant.slug, tenant.logo_path),
    };
  } catch {
    return null;
  }
}

function injectMetaTags(html: string, url: string, tenantMeta?: TenantMeta | null, job?: { title: string; description: string | null; city: string | null; salary: string | null; open_positions: number | null; created_at: string } | null): string {
  const pathname = new URL(url, APP_URL).pathname;
  const careerMatch = pathname.match(/^\/careers\/([^/]+)\/jobs\/(\d+)$/);
  const careersMatch = pathname.match(/^\/careers\/([^/]+)$/);

  if (!careerMatch && !careersMatch) return html;

  const tenantSlug = careerMatch?.[1] || careersMatch?.[1];
  if (!tenantSlug) return html;

  const tenantName = tenantMeta?.name || tenantSlug;
  const logoUrl = tenantMeta?.logo_url || `${APP_URL}/og-default.png`;
  const canonicalUrl = `${APP_URL}${pathname}`;
  const robotsTag = careersMatch ? 'index, follow' : 'index, follow';

  let title = 'Careers';
  let description = 'Find your next role at leading companies across India. Free to apply, direct recruiter contact.';
  let ogType = 'website';

  if (careerMatch && job) {
    const jobId = Number(careerMatch[2]);
    title = `${job.title} | ${tenantName} Careers`;
    description = job.description || `${job.title} at ${tenantName}${job.city ? ` in ${job.city}` : ''}. Free to apply.`;
    ogType = 'article';
  } else if (careersMatch && tenantMeta) {
    title = `${tenantName} Careers | Find your next role`;
    description = `${tenantName} — verified open roles across India. Free to apply, direct recruiter contact.`;
  }

  const metaTags = [
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${robotsTag}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="${escapeHtml(title)}">`,
    `<meta property="og:image" content="${escapeHtml(logoUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(logoUrl)}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
  ];

  const headMatch = html.match(/<head>/i);
  if (headMatch) {
    html = html.replace(headMatch[0], headMatch[0] + '\n' + metaTags.join('\n'));
  }

  const jsonLdScripts: string[] = [];

  if (careerMatch && job) {
    const jobPostingSchema = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      description: job.description || `${job.title} at ${tenantName}`,
      hiringOrganization: { '@type': 'Organization', name: tenantName },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.city || undefined, addressCountry: 'IN' } },
      ...(job.salary ? { baseSalary: { '@type': 'MonetaryAmount', currency: 'INR' } } : {}),
      ...(job.open_positions ? { numberOfPositions: job.open_positions } : {}),
      datePublished: job.created_at || new Date().toISOString(),
      validThrough: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    jsonLdScripts.push(`<script type="application/ld+json">${JSON.stringify(jobPostingSchema)}</script>`);
  } else if (careersMatch && tenantMeta) {
    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${tenantName} Job Listings`,
      description: `${tenantName} — verified open roles across India. Free to apply, direct recruiter contact.`,
      numberOfItems: 0,
      itemListElement: [],
    };
    jsonLdScripts.push(`<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>`);
  }

  if (jsonLdScripts.length > 0) {
    const headCloseMatch = html.match(/<\/head>/i);
    if (headCloseMatch) {
      html = html.replace(headCloseMatch[0], jsonLdScripts.join('\n') + '\n' + headCloseMatch[0]);
    }
  }

  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(process.cwd(), 'client-v2/dist');
  app.use(express.static(clientDist));
  app.get('*', async (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    try {
      const htmlPath = path.join(clientDist, 'index.html');
      const html = readFileSync(htmlPath, 'utf8');
      const careerMatch = req.originalUrl.match(/^\/careers\/([^/]+)\/jobs\/(\d+)$/);
      const careersMatch = req.originalUrl.match(/^\/careers\/([^/]+)$/);
      let tenantMeta: { name: string; slug: string; logo_url: string | null } | null = null;
      let jobMeta: { title: string; description: string | null; city: string | null; salary: string | null; open_positions: number | null; created_at: string } | null = null;
      if (careersMatch) {
        tenantMeta = await fetchTenantMeta(careersMatch[1]);
      } else if (careerMatch) {
        tenantMeta = await fetchTenantMeta(careerMatch[1]);
        if (tenantMeta) {
          try {
            const { rows: jobs } = await pool.query(
              `SELECT title, description, city, salary, open_positions, created_at FROM jobs WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1) AND id = $2 AND status = 'active'`,
              [tenantMeta.slug, Number(careerMatch[2])]
            );
            if (jobs[0]) {
              jobMeta = jobs[0];
            }
          } catch { /* ignore */ }
        }
      }
      const modifiedHtml = injectMetaTags(html, req.originalUrl, tenantMeta, jobMeta);
      res.send(modifiedHtml);
    } catch {
      res.sendFile(path.join(clientDist, 'index.html'), (err) => {
        if (err) res.status(404).json({ error: 'Not found' });
      });
    }
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'AIOS Recruitment API',
      health: '/api/health',
      docs: 'Use the React app at http://localhost:5174 in development',
    });
  });
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error — please try again' });
  }
});

async function start() {
  await initDb();
  startHarmoviaCandidateSyncWorker();
  app.listen(PORT, () => console.log(`AIOS API running on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
