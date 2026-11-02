import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  employeeId: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: 'you-team',
    audience: 'you-team-web',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'you-team',
      audience: 'you-team-web',
    });

    if (typeof decoded === 'string' || !decoded.sub) {
      throw new Error('malformed token payload');
    }

    return {
      sub: decoded.sub,
      email: String(decoded['email'] ?? ''),
      role: decoded['role'] as Role,
      employeeId: (decoded['employeeId'] as string | null) ?? null,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new HttpError(401, 'Access token expired', 'TOKEN_EXPIRED');
    }
    throw HttpError.unauthorized('Invalid access token');
  }
}

/**
 * Refresh tokens are opaque random strings. Only their SHA-256 hash is stored,
 * so a database leak does not hand out usable sessions.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function persistRefreshToken(params: {
  userId: string;
  tokenHash: string;
  userAgent?: string | undefined;
  ip?: string | undefined;
}): Promise<void> {
  await prisma.refreshToken.create({
    data: {
      userId: params.userId,
      tokenHash: params.tokenHash,
      userAgent: params.userAgent ?? null,
      ip: params.ip ?? null,
      expiresAt: refreshTokenExpiry(),
    },
  });
}

/** Best-effort cleanup so the table does not grow without bound. */
export async function purgeExpiredRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { userId, OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
  });
}
