import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { isProduction } from '../config/env.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const mapped = mapError(error);

  if (mapped.status >= 500) {
    console.error('[error]', error);
  }

  res.status(mapped.status).json({
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details ? { details: mapped.details } : {}),
      ...(isProduction || mapped.status < 500
        ? {}
        : { stack: error instanceof Error ? error.stack : undefined }),
    },
  });
};

interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function mapError(error: unknown): MappedError {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Validation failed',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaError(error);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: 'The request contained values the database rejected.',
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message:
        'Cannot reach the database. Is PostgreSQL running? Try `npm run db:start` from the project root.',
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: isProduction ? 'Something went wrong.' : String((error as Error)?.message ?? error),
  };
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): MappedError {
  const target = normaliseTarget(error.meta?.['target']);

  switch (error.code) {
    case 'P2002':
      return {
        status: 409,
        code: 'CONFLICT',
        message: target
          ? `A record with that ${humanise(target)} already exists.`
          : 'A record with those details already exists.',
        details: target ? [{ field: target, message: 'Must be unique' }] : undefined,
      };
    case 'P2003':
      return {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'A referenced record does not exist.',
      };
    case 'P2014':
    case 'P2003_RESTRICT':
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'This record is still referenced by other records and cannot be changed.',
      };
    case 'P2025':
      return {
        status: 404,
        code: 'NOT_FOUND',
        message: 'The requested record does not exist.',
      };
    default:
      return {
        status: 400,
        code: `PRISMA_${error.code}`,
        message: isProduction ? 'The database rejected this request.' : error.message,
      };
  }
}

function normaliseTarget(target: unknown): string | null {
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  return null;
}

function humanise(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}
