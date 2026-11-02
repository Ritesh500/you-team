import { Router } from 'express';
import type { SalesChannel } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { addDays, currentBusinessDay, monthBounds } from '../../lib/dates.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/v1/dashboard/overview
 *
 * Everything the landing page needs in one round trip — headcount KPIs,
 * attendance for today, the pending-approval queue, channel staffing, the
 * 6-month headcount trend and upcoming birthdays/anniversaries.
 */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    // The IST business day, so "today" on the dashboard matches what the
    // attendance card considers today.
    const today = currentBusinessDay();
    const now = new Date();
    const { start: monthStart, end: monthEnd } = monthBounds(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );

    const activeStatuses = ['ACTIVE', 'PROBATION', 'ON_LEAVE', 'NOTICE_PERIOD'] as const;

    // `Promise.all` rather than `$transaction([...])`: the array form of
    // $transaction widens aggregate payload types, which costs us
    // `_count._all` and `_sum.ctcAnnual` on the groupBy/aggregate results.
    const [
      totalEmployees,
      activeEmployees,
      onProbation,
      onNotice,
      joinedThisMonth,
      departments,
      todayAttendance,
      pendingLeaves,
      ctcAggregate,
      byEmploymentType,
      byDepartment,
      channelAssignments,
      recentHires,
      upcomingHolidays,
      announcements,
    ] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { status: { in: ['ACTIVE', 'PROBATION'] } } }),
      prisma.employee.count({ where: { status: 'PROBATION' } }),
      prisma.employee.count({ where: { status: 'NOTICE_PERIOD' } }),
      prisma.employee.count({ where: { joiningDate: { gte: monthStart, lte: monthEnd } } }),
      prisma.department.count(),
      prisma.attendance.groupBy({
        by: ['status'],
        where: { date: today },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.employee.aggregate({
        _sum: { ctcAnnual: true },
        _avg: { ctcAnnual: true },
        where: { status: { in: [...activeStatuses] } },
      }),
      prisma.employee.groupBy({
        by: ['employmentType'],
        _count: { _all: true },
        where: { status: { in: [...activeStatuses] } },
        orderBy: { employmentType: 'asc' },
      }),
      prisma.employee.groupBy({
        by: ['departmentId'],
        _count: { _all: true },
        where: { status: { in: [...activeStatuses] } },
        orderBy: { departmentId: 'asc' },
      }),
      prisma.channelAssignment.findMany({
        where: { employee: { status: { in: [...activeStatuses] } } },
        select: { channel: true, allocationPct: true },
      }),
      prisma.employee.findMany({
        where: { status: { in: [...activeStatuses] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          designation: true,
          avatarUrl: true,
          joiningDate: true,
          department: { select: { name: true } },
        },
        orderBy: { joiningDate: 'desc' },
        take: 5,
      }),
      prisma.holiday.findMany({
        where: { date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 4,
      }),
      prisma.announcement.findMany({
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 4,
        include: { author: { select: { email: true } } },
      }),
    ]);

    const departmentNames = await prisma.department.findMany({
      select: { id: true, name: true, code: true },
    });
    const departmentById = new Map(departmentNames.map((d) => [d.id, d]));

    // Channel staffing, as FTE rather than raw headcount.
    const channelTotals = new Map<SalesChannel, { headcount: number; fte: number }>();
    for (const assignment of channelAssignments) {
      const entry = channelTotals.get(assignment.channel) ?? { headcount: 0, fte: 0 };
      entry.headcount += 1;
      entry.fte += assignment.allocationPct / 100;
      channelTotals.set(assignment.channel, entry);
    }

    const attendanceByStatus = Object.fromEntries(
      todayAttendance.map((row) => [row.status, row._count._all]),
    );
    const presentToday =
      (attendanceByStatus['PRESENT'] ?? 0) + (attendanceByStatus['WORK_FROM_HOME'] ?? 0);

    res.json({
      data: {
        kpis: {
          totalEmployees,
          activeEmployees,
          onProbation,
          onNotice,
          joinedThisMonth,
          departments,
          pendingLeaveApprovals: pendingLeaves,
          presentToday,
          absentToday: attendanceByStatus['ABSENT'] ?? 0,
          onLeaveToday: attendanceByStatus['ON_LEAVE'] ?? 0,
          attendanceRate:
            activeEmployees > 0 ? Math.round((presentToday / activeEmployees) * 100) : 0,
          annualPayrollCost: Number(ctcAggregate._sum.ctcAnnual ?? 0),
          averageCtc: Math.round(Number(ctcAggregate._avg.ctcAnnual ?? 0)),
        },
        employmentTypeMix: byEmploymentType.map((row) => ({
          employmentType: row.employmentType,
          count: row._count._all,
        })),
        departmentMix: byDepartment
          .map((row) => ({
            departmentId: row.departmentId,
            name: row.departmentId
              ? (departmentById.get(row.departmentId)?.name ?? 'Unknown')
              : 'Unassigned',
            code: row.departmentId ? (departmentById.get(row.departmentId)?.code ?? '—') : '—',
            count: row._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        channelStaffing: (['SHOPIFY', 'AMAZON', 'FLIPKART', 'MYNTRA'] as SalesChannel[]).map(
          (channel) => ({
            channel,
            headcount: channelTotals.get(channel)?.headcount ?? 0,
            fte: Math.round((channelTotals.get(channel)?.fte ?? 0) * 100) / 100,
          }),
        ),
        headcountTrend: await headcountTrend(),
        recentHires,
        upcomingHolidays,
        announcements,
        celebrations: await upcomingCelebrations(today),
      },
    });
  }),
);

/** Cumulative active headcount at the end of each of the last six months. */
async function headcountTrend(): Promise<{ month: string; headcount: number }[]> {
  const now = new Date();
  const points: { month: string; headcount: number }[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 0));

    const headcount = await prisma.employee.count({
      where: {
        joiningDate: { lte: cursor },
        OR: [{ exitDate: null }, { exitDate: { gt: cursor } }],
      },
    });

    points.push({
      month: cursor.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      headcount,
    });
  }

  return points;
}

/** Birthdays and work anniversaries in the next 30 days. */
async function upcomingCelebrations(today: Date) {
  const windowEnd = addDays(today, 30);

  const employees = await prisma.employee.findMany({
    where: { status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      designation: true,
      dateOfBirth: true,
      joiningDate: true,
    },
  });

  /** Next occurrence of a month/day, ignoring the original year. */
  const nextOccurrence = (date: Date): Date => {
    const candidate = new Date(
      Date.UTC(today.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    if (candidate < today) candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
    return candidate;
  };

  const events: {
    employeeId: string;
    name: string;
    avatarUrl: string | null;
    designation: string;
    type: 'BIRTHDAY' | 'ANNIVERSARY';
    date: string;
    years?: number;
  }[] = [];

  for (const employee of employees) {
    const name = `${employee.firstName} ${employee.lastName}`;

    if (employee.dateOfBirth) {
      const next = nextOccurrence(employee.dateOfBirth);
      if (next <= windowEnd) {
        events.push({
          employeeId: employee.id,
          name,
          avatarUrl: employee.avatarUrl,
          designation: employee.designation,
          type: 'BIRTHDAY',
          date: next.toISOString().slice(0, 10),
        });
      }
    }

    const nextAnniversary = nextOccurrence(employee.joiningDate);
    const years = nextAnniversary.getUTCFullYear() - employee.joiningDate.getUTCFullYear();
    if (nextAnniversary <= windowEnd && years > 0) {
      events.push({
        employeeId: employee.id,
        name,
        avatarUrl: employee.avatarUrl,
        designation: employee.designation,
        type: 'ANNIVERSARY',
        date: nextAnniversary.toISOString().slice(0, 10),
        years,
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
}

export default router;
