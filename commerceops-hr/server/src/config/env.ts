import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
/** server/ — works from both `src/config` (tsx) and `dist/config` (compiled). */
export const SERVER_ROOT = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  EMBEDDED_PG_PORT: z.coerce.number().int().positive().default(5544),
  EMBEDDED_PG_USER: z.string().default('commerceops'),
  EMBEDDED_PG_PASSWORD: z.string().default('commerceops'),
  EMBEDDED_PG_DATABASE: z.string().default('commerceops_hr'),
  EMBEDDED_PG_DATA_DIR: z.string().default('.pgdata'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@youteam.in'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin@12345'),
  SEED_DEFAULT_PASSWORD: z.string().min(8).default('Welcome@123'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(
    `\n[config] Invalid environment configuration:\n${issues}\n\n` +
      `Copy server/.env.example to server/.env and fill in the missing values.\n`,
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

/** Origins allowed to call the API. Comma-separated WEB_ORIGIN is supported. */
export const allowedOrigins = env.WEB_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
