import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { allowedOrigins, env, isProduction } from './config/env.js';
import { prisma } from './lib/prisma.js';
import apiRouter from './routes.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();

  // Behind a reverse proxy, `req.ip` and rate limiting need the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Tooling requests arrive without an Origin header. Browsers still send one
    // on same-origin POSTs, so a request from the host serving the API (e.g. the
    // Vercel deployment, where web and API share a domain) is always allowed.
    let sameHost = false;
    try {
      sameHost = !!origin && new URL(origin).host === req.headers.host;
    } catch {
      sameHost = false;
    }
    cors({
      origin(_origin, callback) {
        if (!origin || sameHost || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })(req, res, next);
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (!isProduction) {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  app.use(
    '/api',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down a little.' },
      },
    }),
  );

  /** Liveness + database reachability, for `npm run dev` and uptime checks. */
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected', uptime: process.uptime() });
    } catch {
      res.status(503).json({
        status: 'degraded',
        database: 'unreachable',
        hint: 'Start PostgreSQL with `npm run db:start`.',
      });
    }
  });

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
