import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';
import { HttpError } from '../lib/http-error.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';

/** Rejects the request unless it carries a valid `Authorization: Bearer <jwt>`. */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw HttpError.unauthorized('Missing bearer token');
  }

  const payload = verifyAccessToken(header.slice('Bearer '.length).trim());

  req.auth = {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    employeeId: payload.employeeId,
  };

  next();
};

/** Must be mounted after `requireAuth`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw HttpError.unauthorized();
    if (!roles.includes(req.auth.role)) {
      throw HttpError.forbidden(
        `This action requires one of the following roles: ${roles.join(', ')}`,
      );
    }
    next();
  };
}

/** Roles allowed to administer people data. */
export const HR_ROLES: Role[] = ['SUPER_ADMIN', 'HR_MANAGER'];
/** Roles allowed to approve/see team-wide data. */
export const MANAGEMENT_ROLES: Role[] = ['SUPER_ADMIN', 'HR_MANAGER', 'MANAGER'];

export function isHr(role: Role): boolean {
  return HR_ROLES.includes(role);
}

export function isManagement(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}
