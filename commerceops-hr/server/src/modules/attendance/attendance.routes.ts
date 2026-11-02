import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../middleware/validate.js';
import { HR_ROLES, requireAuth, requireRole } from '../../middleware/require-auth.js';
import { buildPageMeta, paginationSchema, toSkipTake } from '../../lib/pagination.js';
import {
  currentBusinessDay,
  formatDateOnly,
  monthBounds,
  toDateOnly,
} from '../../lib/dates.js';
import * as service from './attendance.service.js';

const router = Router();

const attendanceStatusEnum = z.enum([
  'PRESENT',
  'WORK_FROM_HOME',
  'HALF_DAY',
  'ABSENT',
  'ON_LEAVE',
  'HOLIDAY',
  'WEEK_OFF',
  'MISSING_CHECKOUT',
]);

const dateOnlyString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

const listSchema = paginationSchema.extend({
  employeeId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  status: attendanceStatusEnum.optional(),
  from: dateOnlyString.optional(),
  to: dateOnlyString.optional(),
});

const correctionSchema = z.object({
  employeeId: z.string().cuid('Select an employee'),
  date: dateOnlyString,
  status: attendanceStatusEnum,
  checkIn: z.string().datetime().optional().or(z.literal('').transform(() => undefined)),
  checkOut: z.string().datetime().optional().or(z.literal('').transform(() => undefined)),
  // Mandatory, and long enough to actually say something.
  reason: z
    .string()
    .trim()
    .min(10, 'Give a reason of at least 10 characters — this is kept in the audit log')
    .max(500),
});

const workLocationEnum = z.enum(['OFFICE', 'HOME', 'OTHER']);
const workReportStatusEnum = z.enum(['COMPLETED', 'IN_PROGRESS', 'PENDING']);

const checkInSchema = z
  .object({
    workLocation: workLocationEnum,
    workLocationDetail: z
      .string()
      .trim()
      .max(160)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .superRefine((value, ctx) => {
    // Anything other than the office has to say where.
    if (value.workLocation !== 'OFFICE' && !value.workLocationDetail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workLocationDetail'],
        message:
          value.workLocation === 'HOME'
            ? 'Tell us where you are working from'
            : 'Enter the location you are working from',
      });
    }
  });

const workReportBodySchema = z.object({
  details: z
    .string()
    .trim()
    .min(3, 'Describe the task in at least 3 characters')
    .max(2000),
  status: workReportStatusEnum.default('IN_PROGRESS'),
});

const workReportPatchSchema = z
  .object({
    details: z.string().trim().min(3, 'Describe the task in at least 3 characters').max(2000).optional(),
    status: workReportStatusEnum.optional(),
  })
  .refine((value) => value.details !== undefined || value.status !== undefined, {
    message: 'Nothing to update',
  });

const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(new Date().getUTCMonth() + 1),
  employeeId: z.string().cuid().optional(),
});

router.use(requireAuth);

/** The employee record tied to the caller, or 403 if there is none. */
function selfEmployeeId(req: Request): string {
  const id = req.auth?.employeeId;
  if (!id) {
    throw HttpError.forbidden(
      'Your login is not linked to an employee record, so attendance does not apply to it.',
    );
  }
  return id;
}

/**
 * GET /api/v1/attendance/today
 *
 * Everything the attendance card needs: the record, derived state, the server's
 * clock and the business date. Returned on every page load, which is what makes
 * the state survive refresh, logout and login.
 */
router.get(
  '/today',
  asyncHandler(async (req, res) => {
    const employeeId = selfEmployeeId(req);
    await service.reconcileMissingCheckouts(employeeId);
    res.json({ data: await service.getToday(employeeId) });
  }),
);

/** POST /api/v1/attendance/check-in — requires a work location. */
router.post(
  '/check-in',
  validate({ body: checkInSchema }),
  asyncHandler(async (req, res) => {
    const employeeId = selfEmployeeId(req);
    const body = req.body as z.infer<typeof checkInSchema>;
    const record = await service.checkIn(employeeId, {
      workLocation: body.workLocation,
      workLocationDetail: body.workLocationDetail,
    });
    res.status(201).json({ data: await service.getToday(employeeId), record });
  }),
);

// --------------------------- Work reports ----------------------------------
// Reports belong to a day's attendance row and are writable only while that day
// is open — see `assertWritableDay` in the service.

/** POST /api/v1/attendance/work-reports */
router.post(
  '/work-reports',
  validate({ body: workReportBodySchema }),
  asyncHandler(async (req, res) => {
    const employeeId = selfEmployeeId(req);
    const body = req.body as z.infer<typeof workReportBodySchema>;
    res.status(201).json({
      data: await service.addWorkReport({
        employeeId,
        details: body.details,
        status: body.status,
      }),
    });
  }),
);

/** PATCH /api/v1/attendance/work-reports/:id */
router.patch(
  '/work-reports/:id',
  validate({
    params: z.object({ id: z.string().cuid('Not a valid work report id') }),
    body: workReportPatchSchema,
  }),
  asyncHandler(async (req, res) => {
    const employeeId = selfEmployeeId(req);
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof workReportPatchSchema>;
    res.json({
      data: await service.updateWorkReport({
        employeeId,
        reportId: id,
        details: body.details,
        status: body.status,
      }),
    });
  }),
);

/** DELETE /api/v1/attendance/work-reports/:id */
router.delete(
  '/work-reports/:id',
  validate({ params: z.object({ id: z.string().cuid('Not a valid work report id') }) }),
  asyncHandler(async (req, res) => {
    const employeeId = selfEmployeeId(req);
    const { id } = req.params as { id: string };
    res.json({ data: await service.deleteWorkReport({ employeeId, reportId: id }) });
  }),
);

/** POST /api/v1/attendance/check-out */
router.post(
  '/check-out',
  asyncHandler(async (req, res) => {
    const employeeId = selfEmployeeId(req);
    const record = await service.checkOut(employeeId);
    res.json({ data: await service.getToday(employeeId), record });
  }),
);

/**
 * GET /api/v1/attendance — history.
 *
 * Scoped by role: employees see only themselves, managers see their team, HR
 * sees everyone. A caller asking for someone outside their scope gets an empty
 * page rather than a leak.
 */
router.get(
  '/',
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listSchema>;

    await service.reconcileMissingCheckouts();

    const scope = await service.visibilityFilter({
      role: req.auth!.role,
      employeeId: req.auth!.employeeId,
    });

    const filters: Prisma.AttendanceWhereInput[] = [scope];

    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    if (query.departmentId) filters.push({ employee: { departmentId: query.departmentId } });
    if (query.status) filters.push({ status: query.status });
    if (query.from || query.to) {
      filters.push({
        date: {
          ...(query.from ? { gte: toDateOnly(query.from) } : {}),
          ...(query.to ? { lte: toDateOnly(query.to) } : {}),
        },
      });
    }

    const where: Prisma.AttendanceWhereInput = { AND: filters };
    const pagination = { page: query.page, pageSize: query.pageSize };

    const [total, data] = await prisma.$transaction([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: service.attendanceInclude,
        orderBy: [{ date: 'desc' }, { employee: { firstName: 'asc' } }],
        ...toSkipTake(pagination),
      }),
    ]);

    res.json({ data, meta: buildPageMeta(pagination, total) });
  }),
);

/**
 * GET /api/v1/attendance/summary — per-status counts and a day-by-day series
 * for one month, within the caller's visibility scope.
 */
router.get(
  '/summary',
  validate({ query: monthQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof monthQuerySchema>;
    const { start, end } = monthBounds(query.year, query.month);

    await service.reconcileMissingCheckouts();

    const scope = await service.visibilityFilter({
      role: req.auth!.role,
      employeeId: req.auth!.employeeId,
    });

    const where: Prisma.AttendanceWhereInput = {
      AND: [
        scope,
        { date: { gte: start, lte: end } },
        ...(query.employeeId ? [{ employeeId: query.employeeId }] : []),
      ],
    };

    // groupBy is kept out of `$transaction([...])`: the array form widens
    // aggregate payload types and loses `_count._all`.
    const [byStatus, records, headcount] = await Promise.all([
      prisma.attendance.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      prisma.attendance.findMany({
        where,
        select: { date: true, status: true, workedMinutes: true },
        orderBy: { date: 'asc' },
      }),
      prisma.employee.count({ where: { status: { in: ['ACTIVE', 'PROBATION'] } } }),
    ]);

    const series = new Map<
      string,
      { date: string; present: number; absent: number; onLeave: number }
    >();

    for (const record of records) {
      const key = formatDateOnly(record.date);
      const entry = series.get(key) ?? { date: key, present: 0, absent: 0, onLeave: 0 };
      if (record.status === 'PRESENT' || record.status === 'WORK_FROM_HOME') entry.present += 1;
      else if (record.status === 'HALF_DAY') entry.present += 0.5;
      else if (record.status === 'MISSING_CHECKOUT') entry.present += 1;
      else if (record.status === 'ABSENT') entry.absent += 1;
      else if (record.status === 'ON_LEAVE') entry.onLeave += 1;
      series.set(key, entry);
    }

    const totalWorkedMinutes = records.reduce((sum, record) => sum + record.workedMinutes, 0);

    res.json({
      data: {
        year: query.year,
        month: query.month,
        headcount,
        byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
        series: [...series.values()],
        totalWorkedHours: Math.round((totalWorkedMinutes / 60) * 10) / 10,
      },
    });
  }),
);

/**
 * GET /api/v1/attendance/exceptions — open "missing check-out" records for HR.
 */
router.get(
  '/exceptions',
  requireRole(...HR_ROLES),
  asyncHandler(async (_req, res) => {
    await service.reconcileMissingCheckouts();

    res.json({
      data: await prisma.attendance.findMany({
        where: { status: 'MISSING_CHECKOUT' },
        include: service.attendanceInclude,
        orderBy: { date: 'desc' },
        take: 50,
      }),
    });
  }),
);

/**
 * POST /api/v1/attendance/correction — HR corrects a record.
 * Requires a reason and writes before/after values to the audit log.
 */
router.post(
  '/correction',
  requireRole(...HR_ROLES),
  validate({ body: correctionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof correctionSchema>;
    const record = await service.correctAttendance(body, req.auth!.userId);
    res.json({ data: record });
  }),
);

/**
 * POST /api/v1/attendance/mark — retained for compatibility with the original
 * HR marking flow; delegates to the audited correction path.
 */
router.post(
  '/mark',
  requireRole(...HR_ROLES),
  validate({
    body: correctionSchema.extend({
      reason: correctionSchema.shape.reason.default('Marked by HR'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof correctionSchema>;
    res.json({ data: await service.correctAttendance(body, req.auth!.userId) });
  }),
);

/** GET /api/v1/attendance/business-day — the server's notion of "today" (IST). */
router.get(
  '/business-day',
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        businessDate: formatDateOnly(currentBusinessDay()),
        serverTime: new Date().toISOString(),
        timeZone: 'Asia/Kolkata',
      },
    });
  }),
);

export default router;
