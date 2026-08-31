/* ==============================================================================
   Disha Production Server & API Gateway (Express / Node.js)
   Server-authoritative, PostgreSQL-backed, Rate-limited & Hardened.
   ============================================================================== */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quiz.js';
import walletRoutes from './routes/wallet.js';
import paymentsRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import healthRoutes from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Enable Reverse Proxy Trust (DigitalOcean App Platform Ingress / Staging Gateway)
// Trusts 1 upstream proxy hop, correctly identifying unique client IPs without allowing IP spoofing
app.set('trust proxy', 1);

// 1. Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Managed at Nginx/CDN edge
  crossOriginEmbedderPolicy: false
}));

// 2. CORS Configuration
const allowedOrigins = [
  'https://disha-learn-earn-prove.netlify.app',
  'https://bainzo.netlify.app',
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:3000'
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL.replace(/\/$/, ''));
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl) or matching allowed list
    if (!origin || allowedOrigins.includes(origin) || !isProduction) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Razorpay-Signature']
}));

// 3. Global Rate Limiter: 120 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please slow down.'
  }
});
app.use('/api/', globalLimiter);

// 4. Request Body Parsers (with rawBody capture for Razorpay webhook verification)
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 5. Mount API Routes
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);

// 6. 404 Route Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `API endpoint ${req.originalUrl} does not exist.`
  });
});

// 7. Global Error Boundary (Safe error responses, zero stack traces leaked)
app.use((err, req, res, next) => {
  const correlationId = 'ERR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  console.error(`[Unhandled Error] [${correlationId}]:`, err.message);

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please contact support if this persists.',
    correlationId
  });
});

import { db } from './config/db.js';

// 8. Start Server & Graceful Shutdown
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Disha Production API] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Disha Production API] Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  const shutdown = async (signal) => {
    console.log(`[Disha API] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('[Disha API] HTTP server closed.');
      try {
        await db.close();
        console.log('[Disha API] Database pool closed cleanly.');
      } catch (err) {
        console.error('[Disha API] Error closing DB pool:', err.message);
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Disha API] Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
