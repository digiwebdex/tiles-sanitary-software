import express from 'express';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { checkDbConnection } from './db/connection';

// Routes
import authRoutes from './routes/auth';
import healthRoutes from './routes/health';
import suppliersRoutes from './routes/suppliers';
import customersRoutes from './routes/customers';
import productsRoutes from './routes/products';
import stockRoutes from './routes/stock';
import batchesRoutes from './routes/batches';
import dealersRoutes from './routes/dealers';
import subscriptionsRoutes from './routes/subscriptions';
import plansRoutes from './routes/plans';
import backupsRoutes from './routes/backups';
import googleDriveRoutes from './routes/googleDrive';
import auditLogsRoutes from './routes/auditLogs';
import subscriptionStatusRoutes from './routes/subscriptionStatus';
import notificationsRoutes from './routes/notifications';
import uploadsRoutes from './routes/uploads';
import path from 'path';

const app = express();
app.set('trust proxy', 1);

// ── Security ──
app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// P0 hardening: hardcode the allowed headers + methods. Never reflect
// `Access-Control-Request-Headers` from the browser — that would let
// arbitrary attacker-chosen headers be advertised as allowed and is the
// vector flagged in the audit (CORS header reflection).
const ALLOWED_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Requested-With, X-Restore-Token';
const EXPOSED_HEADERS = 'Content-Disposition';

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

// ── Rate limiting ──
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ── Body parsers ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ──
app.use('/api/health', healthRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/batches', batchesRoutes);
app.use('/api/dealers', dealersRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/google-drive', googleDriveRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/subscription', subscriptionStatusRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/uploads', uploadsRoutes);

// Static file serving for uploaded product images, etc.
app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'uploads'), {
    maxAge: '7d',
    fallthrough: true,
  }),
);

// ── 404 handler ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start ──
async function start() {
  console.log(`[TilesERP] Starting in ${env.NODE_ENV} mode...`);

  const dbOk = await checkDbConnection();
  if (!dbOk) {
    console.error('[DB] Cannot connect to database. Exiting.');
    process.exit(1);
  }
  console.log('[DB] Connected successfully');

  app.listen(env.PORT, () => {
    console.log(`[API] Server running on port ${env.PORT}`);
  });
}

start();

export default app;
