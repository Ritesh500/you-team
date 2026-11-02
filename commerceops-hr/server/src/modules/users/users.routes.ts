import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { hashPassword } from '../../lib/password.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';

const router = Router();

const roleEnum = z.enum(['SUPER_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']);

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number'),
  role: roleEnum.default('EMPLOYEE'),
  /** Optionally link this login to an existing employee record. */
  employeeId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

const updateUserSchema = z.object({
  role: roleEnum.optional(),
  isActive: z.boolean().optional(),
  /** Admin password reset — no current password needed. */
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number')
    .optional(),
});

const idParamSchema = z.object({ id: z.string().cuid('Not a valid user id') });

router.use(requireAuth, requireRole('SUPER_ADMIN', 'HR_MANAGER'));

const userSelect = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      designation: true,
      avatarUrl: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const;

/** GET /api/v1/users */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      data: await prisma.user.findMany({
        select: userSelect,
        orderBy: [{ role: 'asc' }, { email: 'asc' }],
      }),
    });
  }),
);

/** POST /api/v1/users */
router.post(
  '/',
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;

    // Only a super admin can mint another super admin.
    if (body.role === 'SUPER_ADMIN' && req.auth!.role !== 'SUPER_ADMIN') {
      throw HttpError.forbidden('Only a super admin can create another super admin');
    }

    if (body.employeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: body.employeeId },
        select: { id: true, userId: true },
      });
      if (!employee) {
        throw HttpError.badRequest('That employee does not exist', [
          { field: 'employeeId', message: 'Unknown employee' },
        ]);
      }
      if (employee.userId) {
        throw HttpError.conflict('That employee already has a login');
      }
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        ...(body.employeeId ? { employee: { connect: { id: body.employeeId } } } : {}),
      },
      select: userSelect,
    });

    res.status(201).json({ data: user });
  }),
);

/** PATCH /api/v1/users/:id */
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof updateUserSchema>;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw HttpError.notFound('No user with that id');

    if (body.role === 'SUPER_ADMIN' && req.auth!.role !== 'SUPER_ADMIN') {
      throw HttpError.forbidden('Only a super admin can grant the super admin role');
    }

    if (target.role === 'SUPER_ADMIN' && req.auth!.role !== 'SUPER_ADMIN') {
      throw HttpError.forbidden('Only a super admin can modify another super admin');
    }

    // Locking yourself out is never what you meant to do.
    if (id === req.auth!.userId && body.isActive === false) {
      throw HttpError.badRequest('You cannot deactivate your own account');
    }
    if (id === req.auth!.userId && body.role && body.role !== target.role) {
      throw HttpError.badRequest('You cannot change your own role');
    }

    // Don't let the last active super admin be demoted or disabled.
    if (target.role === 'SUPER_ADMIN' && (body.isActive === false || (body.role && body.role !== 'SUPER_ADMIN'))) {
      const remaining = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } },
      });
      if (remaining === 0) {
        throw HttpError.conflict(
          'This is the only active super admin. Promote someone else before changing this account.',
        );
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.password !== undefined
            ? { passwordHash: await hashPassword(body.password) }
            : {}),
        },
        select: userSelect,
      });

      // A password reset or deactivation must end existing sessions.
      if (body.password !== undefined || body.isActive === false) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: req.auth!.userId,
          action: 'user.updated',
          entity: 'User',
          entityId: id,
          meta: {
            fields: Object.keys(body).filter((key) => key !== 'password'),
            passwordReset: body.password !== undefined,
          },
        },
      });

      return updated;
    });

    res.json({ data: user });
  }),
);

/** GET /api/v1/users/audit-log — recent administrative activity. */
router.get(
  '/audit-log',
  asyncHandler(async (_req, res) => {
    res.json({
      data: await prisma.auditLog.findMany({
        include: { actor: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    });
  }),
);

export default router;
