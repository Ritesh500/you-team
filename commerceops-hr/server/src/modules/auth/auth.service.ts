import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  persistRefreshToken,
  purgeExpiredRefreshTokens,
  signAccessToken,
} from './auth.tokens.js';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  employeeId: string | null;
  fullName: string;
  designation: string | null;
  department: { id: string; name: string } | null;
  avatarUrl: string | null;
}

export interface SessionResult {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

const userWithEmployee = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      designation: true,
      avatarUrl: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const;

type UserRecord = {
  id: string;
  email: string;
  role: Role;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    designation: string;
    avatarUrl: string | null;
    department: { id: string; name: string } | null;
  } | null;
};

function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee?.id ?? null,
    fullName: user.employee
      ? `${user.employee.firstName} ${user.employee.lastName}`
      : user.email.split('@')[0]!,
    designation: user.employee?.designation ?? null,
    department: user.employee?.department ?? null,
    avatarUrl: user.employee?.avatarUrl ?? null,
  };
}

export async function login(params: {
  email: string;
  password: string;
  userAgent?: string | undefined;
  ip?: string | undefined;
}): Promise<SessionResult> {
  const user = await prisma.user.findUnique({
    where: { email: params.email },
    include: userWithEmployee,
  });

  // Same message and roughly the same work either way, so the response does not
  // reveal whether the address is registered.
  const passwordMatches = user
    ? await verifyPassword(params.password, user.passwordHash)
    : await verifyPassword(params.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');

  if (!user || !passwordMatches) {
    throw HttpError.unauthorized('Incorrect email or password');
  }

  if (!user.isActive) {
    throw HttpError.forbidden('This account has been deactivated. Contact your HR administrator.');
  }

  await purgeExpiredRefreshTokens(user.id);

  const { token: refreshToken, tokenHash } = generateRefreshToken();
  await persistRefreshToken({
    userId: user.id,
    tokenHash,
    userAgent: params.userAgent,
    ip: params.ip,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: toSessionUser(user),
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee?.id ?? null,
    }),
    refreshToken,
  };
}

/**
 * Exchanges a refresh token for a new pair. The presented token is revoked and
 * replaced (rotation), so a stolen token is usable at most once.
 */
export async function refreshSession(params: {
  refreshToken: string;
  userAgent?: string | undefined;
  ip?: string | undefined;
}): Promise<SessionResult> {
  const tokenHash = hashRefreshToken(params.refreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: userWithEmployee } },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw HttpError.unauthorized('Session expired. Please sign in again.');
  }

  if (!stored.user.isActive) {
    throw HttpError.forbidden('This account has been deactivated.');
  }

  const { token: nextToken, tokenHash: nextHash } = generateRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: nextHash,
        userAgent: params.userAgent ?? null,
        ip: params.ip ?? null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  return {
    user: toSessionUser(stored.user),
    accessToken: signAccessToken({
      sub: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
      employeeId: stored.user.employee?.id ?? null,
    }),
    refreshToken: nextToken,
  };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userWithEmployee,
  });

  if (!user || !user.isActive) {
    throw HttpError.unauthorized('Session is no longer valid');
  }

  return toSessionUser(user);
}

export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) throw HttpError.unauthorized();

  if (!(await verifyPassword(params.currentPassword, user.passwordHash))) {
    throw HttpError.badRequest('Current password is incorrect', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(params.newPassword) },
    }),
    // Changing a password ends every other session.
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
