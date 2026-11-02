import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { hashPassword } from '../../lib/password.js';
import { toDateOnly } from '../../lib/dates.js';
import {
  buildPageMeta,
  toSkipTake,
  type Paginated,
  type Pagination,
} from '../../lib/pagination.js';
import type {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from './employees.schema.js';

const listSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  workEmail: true,
  phone: true,
  avatarUrl: true,
  designation: true,
  employmentType: true,
  status: true,
  joiningDate: true,
  ctcAnnual: true,
  department: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  channelAssignments: {
    select: { channel: true, allocationPct: true, isPrimary: true, channelRole: true },
    orderBy: { isPrimary: 'desc' },
  },
} satisfies Prisma.EmployeeSelect;

export async function listEmployees(query: ListEmployeesQuery): Promise<Paginated<unknown>> {
  const where = buildWhere(query);
  const pagination: Pagination = { page: query.page, pageSize: query.pageSize };

  const [total, data] = await prisma.$transaction([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      select: listSelect,
      orderBy: buildOrderBy(query),
      ...toSkipTake(pagination),
    }),
  ]);

  return { data, meta: buildPageMeta(pagination, total) };
}

function buildWhere(query: ListEmployeesQuery): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};

  if (query.search) {
    const search = query.search;
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { workEmail: { contains: search, mode: 'insensitive' } },
      { employeeCode: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.managerId) where.managerId = query.managerId;
  if (query.status) where.status = query.status;
  if (query.employmentType) where.employmentType = query.employmentType;
  if (query.channel) {
    where.channelAssignments = { some: { channel: query.channel } };
  }

  return where;
}

function buildOrderBy(query: ListEmployeesQuery): Prisma.EmployeeOrderByWithRelationInput[] {
  const dir = query.sortDir;
  switch (query.sortBy) {
    case 'joiningDate':
      return [{ joiningDate: dir }];
    case 'employeeCode':
      return [{ employeeCode: dir }];
    case 'ctcAnnual':
      return [{ ctcAnnual: dir }];
    case 'name':
    default:
      return [{ firstName: dir }, { lastName: dir }];
  }
}

export async function getEmployee(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true, code: true } },
      manager: {
        select: { id: true, firstName: true, lastName: true, designation: true, avatarUrl: true },
      },
      reports: {
        select: { id: true, firstName: true, lastName: true, designation: true, avatarUrl: true },
        orderBy: { firstName: 'asc' },
      },
      channelAssignments: { orderBy: { isPrimary: 'desc' } },
      user: { select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true } },
      leaveBalances: {
        where: { year: new Date().getUTCFullYear() },
        include: { leaveType: { select: { id: true, name: true, code: true, colorHex: true } } },
      },
    },
  });

  if (!employee) throw HttpError.notFound('No employee with that id');
  return employee;
}

export async function createEmployee(input: CreateEmployeeInput, actorId: string | null) {
  await assertRelationsExist(input.departmentId, input.managerId);

  const created = await prisma.$transaction(async (tx) => {
    let userId: string | null = null;

    if (input.createLogin && input.password) {
      const existing = await tx.user.findUnique({ where: { email: input.workEmail } });
      if (existing) {
        throw HttpError.conflict('A login already exists for that work email');
      }

      const user = await tx.user.create({
        data: {
          email: input.workEmail,
          passwordHash: await hashPassword(input.password),
          role: input.loginRole as Role,
        },
      });
      userId = user.id;
    }

    const employee = await tx.employee.create({
      data: {
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        workEmail: input.workEmail,
        personalEmail: input.personalEmail ?? null,
        phone: input.phone ?? null,
        avatarUrl: input.avatarUrl ?? null,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth ? toDateOnly(input.dateOfBirth) : null,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country,
        designation: input.designation,
        employmentType: input.employmentType,
        status: input.status,
        joiningDate: toDateOnly(input.joiningDate),
        exitDate: input.exitDate ? toDateOnly(input.exitDate) : null,
        ctcAnnual: new Prisma.Decimal(input.ctcAnnual),
        departmentId: input.departmentId ?? null,
        managerId: input.managerId ?? null,
        userId,
        channelAssignments: {
          create: input.channels.map((channel) => ({
            channel: channel.channel,
            allocationPct: channel.allocationPct,
            isPrimary: channel.isPrimary,
            channelRole: channel.channelRole ?? null,
          })),
        },
      },
      select: listSelect,
    });

    await seedLeaveBalances(tx, employee.id);

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'employee.created',
        entity: 'Employee',
        entityId: employee.id,
        meta: { employeeCode: employee.employeeCode },
      },
    });

    return employee;
  });

  return created;
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
  actorId: string | null,
) {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('No employee with that id');

  await assertRelationsExist(input.departmentId, input.managerId);

  if (input.managerId === id) {
    throw HttpError.badRequest('An employee cannot report to themselves', [
      { field: 'managerId', message: 'Choose a different manager' },
    ]);
  }

  if (input.managerId) {
    await assertNoReportingCycle(id, input.managerId);
  }

  const joiningDate = input.joiningDate ? toDateOnly(input.joiningDate) : existing.joiningDate;
  const exitDate =
    input.exitDate === undefined ? existing.exitDate : input.exitDate ? toDateOnly(input.exitDate) : null;

  if (exitDate && exitDate < joiningDate) {
    throw HttpError.badRequest('Exit date cannot be before the joining date', [
      { field: 'exitDate', message: 'Must be on or after the joining date' },
    ]);
  }

  const data: Prisma.EmployeeUpdateInput = {};

  if (input.employeeCode !== undefined) data.employeeCode = input.employeeCode;
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.workEmail !== undefined) data.workEmail = input.workEmail;
  if (input.personalEmail !== undefined) data.personalEmail = input.personalEmail ?? null;
  if (input.phone !== undefined) data.phone = input.phone ?? null;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl ?? null;
  if (input.gender !== undefined) data.gender = input.gender;
  if (input.dateOfBirth !== undefined) {
    data.dateOfBirth = input.dateOfBirth ? toDateOnly(input.dateOfBirth) : null;
  }
  if (input.addressLine !== undefined) data.addressLine = input.addressLine ?? null;
  if (input.city !== undefined) data.city = input.city ?? null;
  if (input.state !== undefined) data.state = input.state ?? null;
  if (input.country !== undefined) data.country = input.country;
  if (input.designation !== undefined) data.designation = input.designation;
  if (input.employmentType !== undefined) data.employmentType = input.employmentType;
  if (input.status !== undefined) data.status = input.status;
  if (input.joiningDate !== undefined) data.joiningDate = joiningDate;
  if (input.exitDate !== undefined) data.exitDate = exitDate;
  if (input.ctcAnnual !== undefined) data.ctcAnnual = new Prisma.Decimal(input.ctcAnnual);
  if (input.departmentId !== undefined) {
    data.department = input.departmentId
      ? { connect: { id: input.departmentId } }
      : { disconnect: true };
  }
  if (input.managerId !== undefined) {
    data.manager = input.managerId ? { connect: { id: input.managerId } } : { disconnect: true };
  }

  return prisma.$transaction(async (tx) => {
    if (input.channels !== undefined) {
      await tx.channelAssignment.deleteMany({ where: { employeeId: id } });
      if (input.channels.length > 0) {
        await tx.channelAssignment.createMany({
          data: input.channels.map((channel) => ({
            employeeId: id,
            channel: channel.channel,
            allocationPct: channel.allocationPct,
            isPrimary: channel.isPrimary,
            channelRole: channel.channelRole ?? null,
          })),
        });
      }
    }

    const employee = await tx.employee.update({ where: { id }, data, select: listSelect });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'employee.updated',
        entity: 'Employee',
        entityId: id,
        meta: { fields: Object.keys(input) },
      },
    });

    return employee;
  });
}

export async function deleteEmployee(id: string, actorId: string | null): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, employeeCode: true, userId: true, _count: { select: { reports: true } } },
  });

  if (!employee) throw HttpError.notFound('No employee with that id');

  if (employee._count.reports > 0) {
    throw HttpError.conflict(
      'This employee still has direct reports. Reassign them to another manager first.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.delete({ where: { id } });

    // The login is useless without the employee record behind it.
    if (employee.userId) {
      await tx.user.delete({ where: { id: employee.userId } }).catch(() => undefined);
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'employee.deleted',
        entity: 'Employee',
        entityId: id,
        meta: { employeeCode: employee.employeeCode },
      },
    });
  });
}

/** Lightweight list for dropdowns (manager pickers, filters). */
export async function listEmployeeOptions() {
  return prisma.employee.findMany({
    where: { status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE', 'NOTICE_PERIOD'] } },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      designation: true,
      avatarUrl: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

async function assertRelationsExist(
  departmentId: string | undefined,
  managerId: string | undefined,
): Promise<void> {
  if (departmentId) {
    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      throw HttpError.badRequest('That department does not exist', [
        { field: 'departmentId', message: 'Unknown department' },
      ]);
    }
  }

  if (managerId) {
    const manager = await prisma.employee.findUnique({ where: { id: managerId } });
    if (!manager) {
      throw HttpError.badRequest('That manager does not exist', [
        { field: 'managerId', message: 'Unknown employee' },
      ]);
    }
  }
}

/** Walks up the proposed chain so A→B→A cannot be created. */
async function assertNoReportingCycle(employeeId: string, managerId: string): Promise<void> {
  let cursor: string | null = managerId;
  const seen = new Set<string>([employeeId]);

  while (cursor) {
    if (seen.has(cursor)) {
      throw HttpError.badRequest('That manager assignment would create a reporting loop', [
        { field: 'managerId', message: 'Creates a circular reporting line' },
      ]);
    }
    seen.add(cursor);

    const next: { managerId: string | null } | null = await prisma.employee.findUnique({
      where: { id: cursor },
      select: { managerId: true },
    });
    cursor = next?.managerId ?? null;
  }
}

/** Every employee starts with the current year's quota for each leave type. */
async function seedLeaveBalances(
  tx: Prisma.TransactionClient,
  employeeId: string,
): Promise<void> {
  const leaveTypes = await tx.leaveType.findMany({ select: { id: true, annualQuota: true } });
  if (leaveTypes.length === 0) return;

  await tx.leaveBalance.createMany({
    data: leaveTypes.map((type) => ({
      employeeId,
      leaveTypeId: type.id,
      year: new Date().getUTCFullYear(),
      entitled: type.annualQuota,
      used: 0,
    })),
    skipDuplicates: true,
  });
}
