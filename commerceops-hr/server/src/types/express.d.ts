import type { Role } from '@prisma/client';

/** The identity resolved from the access token by `requireAuth`. */
export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  /** Null for accounts not linked to an employee record (e.g. the root admin). */
  employeeId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
