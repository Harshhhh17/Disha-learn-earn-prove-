/* ==============================================================================
   Disha System & Database Health Check Route
   ============================================================================== */

import express from 'express';
import { db } from '../config/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  let dbStatus = 'standalone';
  let isDbOk = true;

  try {
    const r = await db.query('SELECT 1 as alive');
    if (r && r.rows) {
      dbStatus = 'connected';
    }
  } catch (e) {
    dbStatus = 'degraded';
    if (process.env.NODE_ENV === 'production') {
      isDbOk = false;
    }
  }

  const isHealthy = isDbOk;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'disha-backend-api',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

export default router;

