import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import candidateRoutes from './routes/candidates.js';
import jobRoutes from './routes/jobs.js';
import interviewRoutes from './routes/interviews.js';
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

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3010;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/jobs', jobRoutes);
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
app.use('/api/whatsapp', whatsappWebhookRoutes); // unauthenticated — called by Meta's servers
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client-v2/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
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

async function start() {
  await initDb();
  app.listen(PORT, () => console.log(`AIOS API running on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
