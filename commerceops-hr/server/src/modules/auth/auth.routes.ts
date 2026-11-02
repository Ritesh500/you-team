import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env, isProduction } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

const REFRESH_COOKIE = 'youteam_refresh';

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' } },
});

const router = Router();

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** POST /api/v1/auth/login */
router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login({
      email: req.body.email,
      password: req.body.password,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    setRefreshCookie(res, result.refreshToken);

    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);

/** POST /api/v1/auth/refresh */
router.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const token = req.body.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!token) throw HttpError.unauthorized('No refresh token supplied');

    const result = await authService.refreshSession({
      refreshToken: token,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    setRefreshCookie(res, result.refreshToken);

    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);

/** POST /api/v1/auth/logout */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.status(204).send();
  }),
);

/** GET /api/v1/auth/me */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await authService.getCurrentUser(req.auth!.userId) });
  }),
);

/** POST /api/v1/auth/change-password */
router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await authService.changePassword({
      userId: req.auth!.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.status(204).send();
  }),
);

export default router;
