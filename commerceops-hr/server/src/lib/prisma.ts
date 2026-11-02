import { Prisma, PrismaClient } from '@prisma/client';
import { env, isDevelopment } from '../config/env.js';

/**
 * Prisma returns `Decimal` for money columns. Without this, `res.json()` emits
 * them as strings and every consumer has to parse them. Emitting numbers keeps
 * the API contract simple — amounts here never exceed IEEE-754 safe range.
 */
Prisma.Decimal.prototype.toJSON = function toJSON(this: Prisma.Decimal) {
  return this.toNumber() as unknown as string;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDevelopment ? ['warn', 'error'] : ['error'],
  });

// `tsx watch` re-imports modules on change; reuse the client to avoid leaking
// connection pools across reloads.
if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export { Prisma };
