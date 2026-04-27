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

const app = express();
app.set('trust proxy', 1);

// ── Security ──
app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'content-type, authorization');

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
