import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../middleware/validate.js';
import {
  HR_ROLES,
  MANAGEMENT_ROLES,
  isManagement,
  requireAuth,
  requireRole,
} from '../../middleware/require-auth.js';
import { paginationSchema } from '../../lib/pagination.js';
import * as service from './leave.service.js';

const router = Router();

const dateOnlyString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

const listSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  employeeId: z.string().cuid().optional(),
  leaveTypeId: z.string().cuid().optional(),
  from: dateOnlyString.optional(),
  to: dateOnlyString.optional(),
});

const createSchema = z.object({
  /** HR may file on behalf of someone else; everyone else files for themselves. */
  employeeId: z.string().cuid().optional(),
  leaveTypeId: z.string().cuid('Select a leave type'),
  startDate: dateOnlyString,
  endDate: dateOnlyString,
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500),
});

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

const idParamSchema = z.object({ id: z.string().cuid('Not a valid leave request id') });

const balanceQuerySchema = z.object({
  employeeId: z.string().cuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()),
});

const leaveTypeBodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/)
    .transform((value) => value.toUpperCase()),
  annualQuota: z.coerce.number().int().min(0).max(365).default(0),
  isPaid: z.boolean().default(true),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #6366f1')
    .default('#6366f1'),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

router.use(requireAuth);

/** GET /api/v1/leave/types */
router.get(
  '/types',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.leaveType.findMany({ orderBy: { name: 'asc' } }) });
  }),
);

/** POST /api/v1/leave/types */
router.post(
  '/types',
  requireRole(...HR_ROLES),
  validate({ body: leaveTypeBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof leaveTypeBodySchema>;
    const leaveType = await prisma.leaveType.create({
      data: { ...body, description: body.description ?? null },
    });
    res.status(201).json({ data: leaveType });
  }),
);

/** PATCH /api/v1/leave/types/:id */
router.patch(
  '/types/:id',
  requireRole(...HR_ROLES),
  validate({ params: z.object({ id: z.string().cuid() }), body: leaveTypeBodySchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as Partial<z.infer<typeof leaveTypeBodySchema>>;
    const leaveType = await prisma.leaveType.update({
      where: { id },
      data: {
        ...body,
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      },
    });
    res.json({ data: leaveType });
  }),
);

/** GET /api/v1/leave/balances */
router.get(
  '/balances',
  validate({ query: balanceQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof balanceQuerySchema>;

    let employeeId = query.employeeId;
    if (!employeeId || !isManagement(req.auth!.role)) {
      employeeId = req.auth!.employeeId ?? undefined;
    }

    if (!employeeId) {
      throw HttpError.forbidden('Your login is not linked to an employee record');
    }

    res.json({ data: await service.getLeaveBalances(employeeId, query.year) });
  }),
);

/** GET /api/v1/leave/requests */
router.get(
  '/requests',
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listSchema>;
    res.json(
      await service.listLeaveRequests(query, {
        role: req.auth!.role,
        employeeId: req.auth!.employeeId,
      }),
    );
  }),
);

/** POST /api/v1/leave/requests */
router.post(
  '/requests',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;

    // Only HR can file leave for another employee.
    const employeeId =
      body.employeeId && HR_ROLES.includes(req.auth!.role)
        ? body.employeeId
        : req.auth!.employeeId;

    if (!employeeId) {
      throw HttpError.forbidden('Your login is not linked to an employee record');
    }

    const request = await service.createLeaveRequest({
      employeeId,
      leaveTypeId: body.leaveTypeId,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
    });

    res.status(201).json({ data: request });
  }),
);

/** PATCH /api/v1/leave/requests/:id/decision */
router.patch(
  '/requests/:id/decision',
  requireRole(...MANAGEMENT_ROLES),
  validate({ params: idParamSchema, body: decisionSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof decisionSchema>;

    const updated = await service.decideLeaveRequest({
      requestId: id,
      decision: body.decision,
      note: body.note,
      deciderUserId: req.auth!.userId,
    });

    res.json({ data: updated });
  }),
);

/** PATCH /api/v1/leave/requests/:id/cancel */
router.patch(
  '/requests/:id/cancel',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const updated = await service.cancelLeaveRequest({
      requestId: id,
      actor: {
        userId: req.auth!.userId,
        role: req.auth!.role,
        employeeId: req.auth!.employeeId,
      },
    });
    res.json({ data: updated });
  }),
);

export default router;
