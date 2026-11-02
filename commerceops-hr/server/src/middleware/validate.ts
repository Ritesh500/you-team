import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { HttpError } from '../lib/http-error.js';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and *replaces* the request parts with their parsed output, so
 * controllers receive coerced values (numbers, dates, defaults) rather than raw
 * strings. Field-level errors are returned to the client under `details`.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        next(HttpError.badRequest('Validation failed', details));
        return;
      }
      next(error);
    }
  };
}

/** Helper for inferring a validated body type in controllers. */
export type Infer<T extends ZodTypeAny> = z.infer<T>;
