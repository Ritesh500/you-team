import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { daysInMonth, monthBounds } from '../../lib/dates.js';

/**
 * Salary structure used to break a CTC into components. These are the ratios a
 * typical Indian SME uses; they live here (not in the database) because payroll
 * policy changes are a deliberate code change, not a runtime setting.
 */
const STRUCTURE = {
  basicOfGross: 0.5,
  hraOfBasic: 0.4,
  /** Employee PF contribution: 12% of basic, capped at the ₹15,000 wage ceiling. */
  pfRateOfBasic: 0.12,
  pfWageCeilingMonthly: 15_000,
  professionalTaxMonthly: 200,
  /** Flat TDS estimate; real payroll would use the slab the employee declared. */
  tdsRateOfGross: 0.05,
  tdsExemptAnnualCtc: 500_000,
} as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PayslipComputation {
  basic: number;
  hra: number;
  specialAllowance: number;
  bonus: number;
  providentFund: number;
  professionalTax: number;
  tds: number;
  lopDeduction: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  payableDays: number;
  lopDays: number;
}

/** Pure function so payroll maths can be reasoned about (and tested) alone. */
export function computePayslip(params: {
  annualCtc: number;
  totalDaysInMonth: number;
  lopDays: number;
  bonus?: number;
}): PayslipComputation {
  const { annualCtc, totalDaysInMonth, lopDays } = params;
  const bonus = params.bonus ?? 0;

  const monthlyGross = annualCtc / 12;
  const basic = monthlyGross * STRUCTURE.basicOfGross;
  const hra = basic * STRUCTURE.hraOfBasic;
  const specialAllowance = Math.max(0, monthlyGross - basic - hra);

  const payableDays = Math.max(0, totalDaysInMonth - lopDays);
  const attendanceFactor = totalDaysInMonth > 0 ? payableDays / totalDaysInMonth : 0;

  const earnedBasic = basic * attendanceFactor;
  const earnedHra = hra * attendanceFactor;
  const earnedSpecial = specialAllowance * attendanceFactor;

  const grossEarnings = earnedBasic + earnedHra + earnedSpecial + bonus;
  const lopDeduction = monthlyGross - (earnedBasic + earnedHra + earnedSpecial);

  const pfWage = Math.min(earnedBasic, STRUCTURE.pfWageCeilingMonthly);
  const providentFund = pfWage * STRUCTURE.pfRateOfBasic;
  const professionalTax = grossEarnings > 0 ? STRUCTURE.professionalTaxMonthly : 0;
  const tds =
    annualCtc > STRUCTURE.tdsExemptAnnualCtc ? grossEarnings * STRUCTURE.tdsRateOfGross : 0;

  const totalDeductions = providentFund + professionalTax + tds;

  return {
    basic: round2(earnedBasic),
    hra: round2(earnedHra),
    specialAllowance: round2(earnedSpecial),
    bonus: round2(bonus),
    providentFund: round2(providentFund),
    professionalTax: round2(professionalTax),
    tds: round2(tds),
    lopDeduction: round2(Math.max(0, lopDeduction)),
    grossEarnings: round2(grossEarnings),
    totalDeductions: round2(totalDeductions),
    netPay: round2(grossEarnings - totalDeductions),
    payableDays,
    lopDays,
  };
}

export async function listPayrollRuns() {
  const runs = await prisma.payrollRun.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { _count: { select: { payslips: true } } },
  });

  const totals = await prisma.payslip.groupBy({
    by: ['payrollRunId'],
    _sum: { netPay: true, grossEarnings: true, totalDeductions: true },
  });

  const totalsByRun = new Map(totals.map((row) => [row.payrollRunId, row._sum]));

  return runs.map((run) => {
    const sums = totalsByRun.get(run.id);
    return {
      ...run,
      employeeCount: run._count.payslips,
      totalNetPay: Number(sums?.netPay ?? 0),
      totalGross: Number(sums?.grossEarnings ?? 0),
      totalDeductions: Number(sums?.totalDeductions ?? 0),
    };
  });
}

export async function getPayrollRun(id: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      payslips: {
        include: {
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
        },
        orderBy: { employee: { firstName: 'asc' } },
      },
    },
  });

  if (!run) throw HttpError.notFound('No payroll run with that id');

  const totals = run.payslips.reduce(
    (acc, slip) => ({
      gross: acc.gross + Number(slip.grossEarnings),
      deductions: acc.deductions + Number(slip.totalDeductions),
      net: acc.net + Number(slip.netPay),
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

  return { ...run, totals };
}

/**
 * Builds a draft run for the month from every payable employee, deriving LOP
 * days from recorded ABSENT/HALF_DAY attendance.
 */
export async function generatePayrollRun(params: {
  month: number;
  year: number;
  actorId: string;
}) {
  const { month, year } = params;

  const existing = await prisma.payrollRun.findUnique({
    where: { month_year: { month, year } },
  });

  if (existing) {
    throw HttpError.conflict(
      `Payroll for ${month}/${year} already exists. Delete the draft run first to regenerate it.`,
    );
  }

  const { start, end } = monthBounds(year, month);
  const totalDays = daysInMonth(year, month);

  // Anyone employed for part of the month is payable; people who left before it
  // started or joined after it ended are not.
  const employees = await prisma.employee.findMany({
    where: {
      joiningDate: { lte: end },
      status: { notIn: ['TERMINATED'] },
      OR: [{ exitDate: null }, { exitDate: { gte: start } }],
    },
    select: { id: true, ctcAnnual: true },
  });

  if (employees.length === 0) {
    throw HttpError.unprocessable('No payable employees found for that month.');
  }

  const absences = await prisma.attendance.groupBy({
    by: ['employeeId', 'status'],
    where: {
      date: { gte: start, lte: end },
      status: { in: ['ABSENT', 'HALF_DAY'] },
    },
    _count: { _all: true },
  });

  const lopByEmployee = new Map<string, number>();
  for (const row of absences) {
    const weight = row.status === 'HALF_DAY' ? 0.5 : 1;
    lopByEmployee.set(
      row.employeeId,
      (lopByEmployee.get(row.employeeId) ?? 0) + row._count._all * weight,
    );
  }

  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: { month, year, status: 'DRAFT' },
    });

    const payslips = employees.map((employee) => {
      const computed = computePayslip({
        annualCtc: Number(employee.ctcAnnual),
        totalDaysInMonth: totalDays,
        lopDays: lopByEmployee.get(employee.id) ?? 0,
      });

      return {
        payrollRunId: run.id,
        employeeId: employee.id,
        basic: new Prisma.Decimal(computed.basic),
        hra: new Prisma.Decimal(computed.hra),
        specialAllowance: new Prisma.Decimal(computed.specialAllowance),
        bonus: new Prisma.Decimal(computed.bonus),
        providentFund: new Prisma.Decimal(computed.providentFund),
        professionalTax: new Prisma.Decimal(computed.professionalTax),
        tds: new Prisma.Decimal(computed.tds),
        lopDeduction: new Prisma.Decimal(computed.lopDeduction),
        grossEarnings: new Prisma.Decimal(computed.grossEarnings),
        totalDeductions: new Prisma.Decimal(computed.totalDeductions),
        netPay: new Prisma.Decimal(computed.netPay),
        payableDays: Math.round(computed.payableDays),
        lopDays: Math.round(computed.lopDays),
      };
    });

    await tx.payslip.createMany({ data: payslips });

    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        action: 'payroll.generated',
        entity: 'PayrollRun',
        entityId: run.id,
        meta: { month, year, employeeCount: employees.length },
      },
    });

    return run;
  });
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['APPROVED'],
  APPROVED: ['PAID', 'DRAFT'],
  PAID: [],
};

export async function updatePayrollRunStatus(params: {
  id: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  actorId: string;
}) {
  const run = await prisma.payrollRun.findUnique({ where: { id: params.id } });
  if (!run) throw HttpError.notFound('No payroll run with that id');

  const allowed = ALLOWED_TRANSITIONS[run.status] ?? [];
  if (!allowed.includes(params.status)) {
    throw HttpError.conflict(
      `A ${run.status.toLowerCase()} run cannot move to ${params.status.toLowerCase()}.`,
    );
  }

  return prisma.payrollRun.update({
    where: { id: params.id },
    data: {
      status: params.status,
      ...(params.status === 'APPROVED' ? { processedAt: new Date() } : {}),
      ...(params.status === 'PAID' ? { paidAt: new Date() } : {}),
    },
  });
}

export async function deletePayrollRun(id: string): Promise<void> {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw HttpError.notFound('No payroll run with that id');

  if (run.status !== 'DRAFT') {
    throw HttpError.conflict('Only draft runs can be deleted.');
  }

  await prisma.payrollRun.delete({ where: { id } });
}

/** Payslips visible to one employee, newest first. */
export async function listPayslipsForEmployee(employeeId: string) {
  return prisma.payslip.findMany({
    where: { employeeId, payrollRun: { status: { in: ['APPROVED', 'PAID'] } } },
    include: {
      payrollRun: { select: { id: true, month: true, year: true, status: true, paidAt: true } },
    },
    orderBy: [{ payrollRun: { year: 'desc' } }, { payrollRun: { month: 'desc' } }],
  });
}
