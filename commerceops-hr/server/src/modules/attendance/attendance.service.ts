import {
  Prisma,
  type AttendanceStatus,
  type Role,
  type WorkLocation,
  type WorkReportStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { currentBusinessDay, formatDateOnly, toDateOnly } from '../../lib/dates.js';

/** Under this many minutes on the clock, a day is recorded as a half day. */
const HALF_DAY_THRESHOLD_MINUTES = 240;

/** A punch more than this far in the past is almost certainly a stale request. */
const MAX_SHIFT_MINUTES = 16 * 60;

export const attendanceInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      designation: true,
      department: { select: { id: true, name: true } },
    },
  },
  correctedBy: { select: { id: true, email: true } },
  workReports: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AttendanceInclude;

export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

/**
 * Flags past days that were checked into but never closed.
 *
 * Deliberately does **not** invent a checkout time — the record keeps a null
 * checkOut and zero worked minutes so HR can see exactly what happened and
 * correct it with a reason.
 *
 * Idempotent and cheap (one indexed UPDATE), so it is safe to call on the read
 * paths rather than depending on a scheduler.
 */
export async function reconcileMissingCheckouts(employeeId?: string): Promise<number> {
  const { count } = await prisma.attendance.updateMany({
    where: {
      ...(employeeId ? { employeeId } : {}),
      date: { lt: currentBusinessDay() },
      checkIn: { not: null },
      checkOut: null,
      status: { in: ['PRESENT', 'WORK_FROM_HOME', 'HALF_DAY'] },
    },
    data: { status: 'MISSING_CHECKOUT' },
  });
  return count;
}

export interface TodayAttendance {
  businessDate: string;
  serverTime: string;
  timeZone: 'Asia/Kolkata';
  record: Prisma.AttendanceGetPayload<{ include: typeof attendanceInclude }> | null;
  /** Checked in and not yet out — drives the "Currently working" state. */
  isWorking: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  /** Live minutes since check-in while working; final worked minutes after. */
  elapsedMinutes: number;
  /**
   * Work reports are editable only between check-in and check-out. Once the day
   * is closed its reports are frozen — a later day gets its own set.
   */
  canEditWorkReports: boolean;
  workReportsLocked: boolean;
}

export async function getToday(employeeId: string): Promise<TodayAttendance> {
  const date = currentBusinessDay();
  const now = new Date();

  const record = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
    include: attendanceInclude,
  });

  const isWorking = Boolean(record?.checkIn && !record.checkOut);

  return {
    businessDate: formatDateOnly(date),
    serverTime: now.toISOString(),
    timeZone: 'Asia/Kolkata',
    record,
    isWorking,
    canCheckIn: !record?.checkIn,
    canCheckOut: isWorking,
    elapsedMinutes: record?.checkIn
      ? record.checkOut
        ? record.workedMinutes
        : minutesBetween(record.checkIn, now)
      : 0,
    canEditWorkReports: isWorking,
    workReportsLocked: Boolean(record?.checkOut),
  };
}

/**
 * Check in for the current business day.
 *
 * Concurrency-safe without an explicit lock. Two paths can race:
 *   1. `updateMany` is guarded by `checkIn: null`, so only one concurrent
 *      request can claim an existing row.
 *   2. If no row exists, `create` races on the (employeeId, date) unique index —
 *      the loser gets P2002, which we translate into "already checked in".
 *
 * Repeated clicks therefore produce one record and one 409, never two rows.
 */
export interface CheckInInput {
  workLocation: WorkLocation;
  workLocationDetail?: string | undefined;
}

export async function checkIn(employeeId: string, input: CheckInInput) {
  const date = currentBusinessDay();
  const now = new Date();

  // Working anywhere other than the office has to say where. Enforced here as
  // well as in the request schema so the rule holds for every caller.
  const detail = input.workLocationDetail?.trim() || null;
  if (input.workLocation !== 'OFFICE' && !detail) {
    throw HttpError.badRequest(
      input.workLocation === 'HOME'
        ? 'Tell us where you are working from today.'
        : 'Enter the location you are working from today.',
      [{ field: 'workLocationDetail', message: 'Required for this work location' }],
    );
  }

  const punch = {
    checkIn: now,
    status: 'PRESENT' as const,
    workedMinutes: 0,
    workLocation: input.workLocation,
    workLocationDetail: input.workLocation === 'OFFICE' ? null : detail,
  };

  // Claim an existing row for the day (seeded WEEK_OFF/HOLIDAY rows included)
  // only if nobody has punched in yet.
  const claimed = await prisma.attendance.updateMany({
    where: { employeeId, date, checkIn: null },
    data: punch,
  });

  if (claimed.count === 0) {
    try {
      return await prisma.attendance.create({
        data: { employeeId, date, ...punch },
        include: attendanceInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw HttpError.conflict('You have already checked in today.');
      }
      throw error;
    }
  }

  const record = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
    include: attendanceInclude,
  });

  if (!record) throw HttpError.conflict('Could not record the check-in. Please try again.');
  return record;
}

/**
 * Check out of the current business day.
 *
 * The write is guarded by `checkOut: null`, so of two simultaneous requests
 * exactly one updates a row; the other sees `count === 0` and is told it has
 * already checked out.
 */
export async function checkOut(employeeId: string) {
  const date = currentBusinessDay();
  const now = new Date();

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });

  if (!existing?.checkIn) {
    throw HttpError.badRequest('You need to check in before you can check out.');
  }
  if (existing.checkOut) {
    throw HttpError.conflict('You have already checked out today.');
  }

  const workedMinutes = minutesBetween(existing.checkIn, now);

  if (workedMinutes > MAX_SHIFT_MINUTES) {
    throw HttpError.unprocessable(
      'That check-in is more than 16 hours old. Ask HR to correct the record instead — ' +
        'checking out now would overstate the day.',
    );
  }

  const updated = await prisma.attendance.updateMany({
    where: { employeeId, date, checkOut: null },
    data: {
      checkOut: now,
      workedMinutes,
      status: workedMinutes < HALF_DAY_THRESHOLD_MINUTES ? 'HALF_DAY' : 'PRESENT',
    },
  });

  if (updated.count === 0) {
    throw HttpError.conflict('You have already checked out today.');
  }

  const record = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
    include: attendanceInclude,
  });

  if (!record) throw HttpError.notFound('Attendance record disappeared mid-update.');
  return record;
}

// ---------------------------------------------------------------------------
// Work reports
// ---------------------------------------------------------------------------

/**
 * Resolves the attendance row a report belongs to and asserts it is still open.
 *
 * This is the single gate for the "locked after check-out" rule: reports are
 * writable only on the day they belong to, and only while that day has a
 * check-in and no check-out. A past day is never writable again, which is also
 * why a new day automatically starts with an empty set.
 */
async function assertWritableDay(employeeId: string, attendanceId?: string) {
  const attendance = attendanceId
    ? await prisma.attendance.findUnique({ where: { id: attendanceId } })
    : await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId, date: currentBusinessDay() } },
      });

  if (!attendance) {
    throw HttpError.badRequest('Check in first — work reports belong to a working day.');
  }

  if (attendance.employeeId !== employeeId) {
    throw HttpError.forbidden('You can only edit your own work reports.');
  }

  if (!attendance.checkIn) {
    throw HttpError.badRequest('Check in before adding a work report.');
  }

  if (attendance.checkOut) {
    throw HttpError.conflict(
      "You have checked out for this day, so its work report is locked. Tomorrow's report starts fresh.",
    );
  }

  // Belt and braces: even an open row from an earlier day cannot be edited.
  if (formatDateOnly(attendance.date) !== formatDateOnly(currentBusinessDay())) {
    throw HttpError.conflict(
      'That day is closed. Work reports can only be edited on the day they belong to.',
    );
  }

  return attendance;
}

export async function addWorkReport(input: {
  employeeId: string;
  details: string;
  status: WorkReportStatus;
}) {
  const attendance = await assertWritableDay(input.employeeId);

  await prisma.workReport.create({
    data: {
      attendanceId: attendance.id,
      details: input.details.trim(),
      status: input.status,
    },
  });

  return getToday(input.employeeId);
}

export async function updateWorkReport(input: {
  employeeId: string;
  reportId: string;
  details?: string | undefined;
  status?: WorkReportStatus | undefined;
}) {
  const report = await prisma.workReport.findUnique({ where: { id: input.reportId } });
  if (!report) throw HttpError.notFound('No work report with that id.');

  await assertWritableDay(input.employeeId, report.attendanceId);

  await prisma.workReport.update({
    where: { id: input.reportId },
    data: {
      ...(input.details !== undefined ? { details: input.details.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  return getToday(input.employeeId);
}

export async function deleteWorkReport(input: { employeeId: string; reportId: string }) {
  const report = await prisma.workReport.findUnique({ where: { id: input.reportId } });
  if (!report) throw HttpError.notFound('No work report with that id.');

  await assertWritableDay(input.employeeId, report.attendanceId);
  await prisma.workReport.delete({ where: { id: input.reportId } });

  return getToday(input.employeeId);
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Which employees a caller may see attendance for.
 *
 * - HR and super admins: everyone.
 * - Managers: themselves and their direct reports.
 * - Everyone else: only themselves.
 */
export async function visibilityFilter(actor: {
  role: Role;
  employeeId: string | null;
}): Promise<Prisma.AttendanceWhereInput> {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HR_MANAGER') return {};

  if (!actor.employeeId) {
    throw HttpError.forbidden('Your login is not linked to an employee record.');
  }

  if (actor.role === 'MANAGER') {
    const reports = await prisma.employee.findMany({
      where: { managerId: actor.employeeId },
      select: { id: true },
    });
    return { employeeId: { in: [actor.employeeId, ...reports.map((r) => r.id)] } };
  }

  return { employeeId: actor.employeeId };
}

/** True when the caller may correct attendance for anyone. */
export function canCorrect(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'HR_MANAGER';
}

// ---------------------------------------------------------------------------
// HR correction
// ---------------------------------------------------------------------------

export interface CorrectionInput {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string | undefined;
  checkOut?: string | undefined;
  reason: string;
}

/**
 * HR correction. The reason is mandatory (enforced by the schema) and both the
 * previous and new values are written to the audit log, so a correction can
 * always be traced back to a person and a justification.
 */
export async function correctAttendance(input: CorrectionInput, actorUserId: string) {
  const date = toDateOnly(input.date);

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) throw HttpError.notFound('No employee with that id.');

  if (date > currentBusinessDay()) {
    throw HttpError.badRequest('Attendance cannot be recorded for a future date.', [
      { field: 'date', message: 'Pick today or an earlier date' },
    ]);
  }

  const checkIn = input.checkIn ? new Date(input.checkIn) : null;
  const checkOut = input.checkOut ? new Date(input.checkOut) : null;

  if (checkIn && Number.isNaN(checkIn.getTime())) {
    throw HttpError.badRequest('Check-in is not a valid timestamp.', [
      { field: 'checkIn', message: 'Invalid time' },
    ]);
  }
  if (checkOut && Number.isNaN(checkOut.getTime())) {
    throw HttpError.badRequest('Check-out is not a valid timestamp.', [
      { field: 'checkOut', message: 'Invalid time' },
    ]);
  }
  if (checkOut && !checkIn) {
    throw HttpError.badRequest('A check-out needs a check-in on the same record.', [
      { field: 'checkIn', message: 'Required when a check-out is given' },
    ]);
  }
  if (checkIn && checkOut && checkOut <= checkIn) {
    throw HttpError.badRequest('Check-out must be after check-in.', [
      { field: 'checkOut', message: 'Must be later than the check-in time' },
    ]);
  }

  const workedMinutes = checkIn && checkOut ? minutesBetween(checkIn, checkOut) : 0;

  return prisma.$transaction(async (tx) => {
    const before = await tx.attendance.findUnique({
      where: { employeeId_date: { employeeId: input.employeeId, date } },
    });

    const record = await tx.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date } },
      create: {
        employeeId: input.employeeId,
        date,
        status: input.status,
        checkIn,
        checkOut,
        workedMinutes,
        correctedById: actorUserId,
        correctedAt: new Date(),
        correctionReason: input.reason,
      },
      update: {
        status: input.status,
        checkIn,
        checkOut,
        workedMinutes,
        correctedById: actorUserId,
        correctedAt: new Date(),
        correctionReason: input.reason,
      },
      include: attendanceInclude,
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        action: before ? 'attendance.corrected' : 'attendance.created',
        entity: 'Attendance',
        entityId: record.id,
        meta: {
          employeeId: input.employeeId,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          date: formatDateOnly(date),
          reason: input.reason,
          before: before
            ? {
                status: before.status,
                checkIn: before.checkIn?.toISOString() ?? null,
                checkOut: before.checkOut?.toISOString() ?? null,
                workedMinutes: before.workedMinutes,
              }
            : null,
          after: {
            status: record.status,
            checkIn: record.checkIn?.toISOString() ?? null,
            checkOut: record.checkOut?.toISOString() ?? null,
            workedMinutes: record.workedMinutes,
          },
        },
      },
    });

    return record;
  });
}
