import { Prisma, type LeaveStatus, type Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { countWorkingDays, toDateOnly } from '../../lib/dates.js';
import { buildPageMeta, toSkipTake, type Pagination } from '../../lib/pagination.js';
import { isManagement } from '../../middleware/require-auth.js';

const requestInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      designation: true,
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  leaveType: { select: { id: true, name: true, code: true, colorHex: true, isPaid: true } },
  decidedBy: { select: { id: true, email: true } },
} satisfies Prisma.LeaveRequestInclude;

export interface ListLeaveParams extends Pagination {
  status?: LeaveStatus | undefined;
  employeeId?: string | undefined;
  leaveTypeId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export async function listLeaveRequests(
  params: ListLeaveParams,
  actor: { role: Role; employeeId: string | null },
) {
  const where: Prisma.LeaveRequestWhereInput = {};

  if (!isManagement(actor.role)) {
    if (!actor.employeeId) {
      throw HttpError.forbidden('Your login is not linked to an employee record');
    }
    where.employeeId = actor.employeeId;
  } else if (params.employeeId) {
    where.employeeId = params.employeeId;
  }

  if (params.status) where.status = params.status;
  if (params.leaveTypeId) where.leaveTypeId = params.leaveTypeId;
  if (params.from) where.endDate = { gte: toDateOnly(params.from) };
  if (params.to) where.startDate = { lte: toDateOnly(params.to) };

  const pagination: Pagination = { page: params.page, pageSize: params.pageSize };

  const [total, data] = await prisma.$transaction([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      ...toSkipTake(pagination),
    }),
  ]);

  return { data, meta: buildPageMeta(pagination, total) };
}

export async function createLeaveRequest(input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  const startDate = toDateOnly(input.startDate);
  const endDate = toDateOnly(input.endDate);

  if (endDate < startDate) {
    throw HttpError.badRequest('The end date cannot be before the start date', [
      { field: 'endDate', message: 'Must be on or after the start date' },
    ]);
  }

  const [employee, leaveType, holidays] = await Promise.all([
    prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } }),
    prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } }),
    prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate }, isOptional: false },
      select: { date: true },
    }),
  ]);

  if (!employee) throw HttpError.notFound('No employee with that id');
  if (!leaveType) {
    throw HttpError.badRequest('That leave type does not exist', [
      { field: 'leaveTypeId', message: 'Unknown leave type' },
    ]);
  }

  const days = countWorkingDays(
    startDate,
    endDate,
    holidays.map((holiday) => holiday.date),
  );

  if (days === 0) {
    throw HttpError.badRequest(
      'That range contains no working days — it is all weekends and holidays.',
    );
  }

  // Reject ranges that touch an existing pending or approved request.
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  });

  if (clash) {
    throw HttpError.conflict('You already have a leave request that overlaps those dates');
  }

  const year = startDate.getUTCFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        year,
      },
    },
  });

  if (balance && balance.entitled - balance.used < days) {
    throw HttpError.unprocessable(
      `Not enough ${leaveType.name} left — ${balance.entitled - balance.used} day(s) available, ${days} requested.`,
    );
  }

  return prisma.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate,
      endDate,
      days,
      reason: input.reason,
      status: 'PENDING',
    },
    include: requestInclude,
  });
}

/**
 * Approve or reject. Approval debits the leave balance and writes ON_LEAVE
 * attendance rows for each working day, all in one transaction so a partial
 * approval can never be observed.
 */
export async function decideLeaveRequest(input: {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  note?: string | undefined;
  deciderUserId: string;
}) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: input.requestId },
    include: { leaveType: true },
  });

  if (!request) throw HttpError.notFound('No leave request with that id');
  if (request.status !== 'PENDING') {
    throw HttpError.conflict(`This request has already been ${request.status.toLowerCase()}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: input.decision,
        decidedById: input.deciderUserId,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      },
      include: requestInclude,
    });

    if (input.decision === 'APPROVED') {
      const year = request.startDate.getUTCFullYear();

      await tx.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
        create: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
          entitled: request.leaveType.annualQuota,
          used: request.days,
        },
        update: { used: { increment: request.days } },
      });

      const holidays = await tx.holiday.findMany({
        where: { date: { gte: request.startDate, lte: request.endDate }, isOptional: false },
        select: { date: true },
      });
      const holidaySet = new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));

      const workingDays: Date[] = [];
      for (
        let cursor = new Date(request.startDate);
        cursor <= request.endDate;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        const day = cursor.getUTCDay();
        const iso = cursor.toISOString().slice(0, 10);
        if (day !== 0 && day !== 6 && !holidaySet.has(iso)) {
          workingDays.push(new Date(cursor));
        }
      }

      for (const date of workingDays) {
        await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: request.employeeId, date } },
          create: {
            employeeId: request.employeeId,
            date,
            status: 'ON_LEAVE',
            notes: `${request.leaveType.name} (approved)`,
          },
          update: { status: 'ON_LEAVE', notes: `${request.leaveType.name} (approved)` },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId: input.deciderUserId,
        action: `leave.${input.decision.toLowerCase()}`,
        entity: 'LeaveRequest',
        entityId: request.id,
        meta: { days: request.days, employeeId: request.employeeId },
      },
    });

    return updated;
  });
}

export async function cancelLeaveRequest(input: {
  requestId: string;
  actor: { userId: string; role: Role; employeeId: string | null };
}) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: input.requestId },
    include: { leaveType: true },
  });

  if (!request) throw HttpError.notFound('No leave request with that id');

  const ownsRequest = request.employeeId === input.actor.employeeId;
  if (!ownsRequest && !isManagement(input.actor.role)) {
    throw HttpError.forbidden('You can only cancel your own leave requests');
  }

  if (request.status === 'CANCELLED') {
    throw HttpError.conflict('This request is already cancelled');
  }
  if (request.status === 'REJECTED') {
    throw HttpError.conflict('A rejected request cannot be cancelled');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED' },
      include: requestInclude,
    });

    // Cancelling an approved request gives the days back and clears the
    // ON_LEAVE attendance rows it created.
    if (request.status === 'APPROVED') {
      await tx.leaveBalance.updateMany({
        where: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year: request.startDate.getUTCFullYear(),
        },
        data: { used: { decrement: request.days } },
      });

      await tx.attendance.deleteMany({
        where: {
          employeeId: request.employeeId,
          status: 'ON_LEAVE',
          date: { gte: request.startDate, lte: request.endDate },
        },
      });
    }

    return updated;
  });
}

export async function getLeaveBalances(employeeId: string, year: number) {
  const [balances, leaveTypes] = await Promise.all([
    prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
    }),
    prisma.leaveType.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const byType = new Map(balances.map((balance) => [balance.leaveTypeId, balance]));

  // Return a row per leave type even when no balance has been created yet, so
  // the UI never shows a partial list.
  return leaveTypes.map((leaveType) => {
    const balance = byType.get(leaveType.id);
    const entitled = balance?.entitled ?? leaveType.annualQuota;
    const used = balance?.used ?? 0;
    return {
      leaveType: {
        id: leaveType.id,
        name: leaveType.name,
        code: leaveType.code,
        colorHex: leaveType.colorHex,
        isPaid: leaveType.isPaid,
      },
      year,
      entitled,
      used,
      available: Math.max(0, entitled - used),
    };
  });
}
