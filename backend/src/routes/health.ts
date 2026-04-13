import { Router, Request, Response } from 'express';
import { checkDbConnection } from '../db/connection';

const router = Router();

// GET /api/health
router.get('/', async (_req: Request, res: Response) => {
  const dbOk = await checkDbConnection();

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? 'connected' : 'disconnected',
      api: 'running',
    },
  });
});

export default router;
