/**
 * Seeds a realistic multi-channel e-commerce org: departments, 28 employees
 * across Shopify/Amazon/Flipkart/Myntra, a reporting hierarchy, two months of
 * attendance, leave requests in every state, and one approved payroll run.
 *
 *   npm run db:seed
 *
 * Idempotent: re-running clears the operational tables and rebuilds them.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import type {
  AttendanceStatus,
  EmployeeStatus,
  EmploymentType,
  Gender,
  Role,
  SalesChannel,
} from '@prisma/client';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/password.js';
import { computePayslip } from '../src/modules/payroll/payroll.service.js';
import { daysInMonth, monthBounds, toDateOnly } from '../src/lib/dates.js';

const prisma = new PrismaClient();

/** Deterministic PRNG so repeated seeds produce the same demo data. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
const random = makeRandom(20261023);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

interface EmployeeSeed {
  code: string;
  firstName: string;
  lastName: string;
  designation: string;
  department: string;
  gender: Gender;
  dob: string;
  joining: string;
  ctc: number;
  city: string;
  state: string;
  employmentType?: EmploymentType;
  status?: EmployeeStatus;
  managerCode?: string;
  channels?: { channel: SalesChannel; allocationPct: number; isPrimary?: boolean; role?: string }[];
  login?: { role: Role };
}

const DEPARTMENTS = [
  { name: 'Leadership', code: 'LEAD', description: 'Founders and functional heads' },
  { name: 'Marketplace Operations', code: 'MKTOPS', description: 'Listings, orders and channel health across Amazon, Flipkart and Myntra' },
  { name: 'Catalogue & Content', code: 'CAT', description: 'Product data, imagery, A+ content and copy' },
  { name: 'Performance Marketing', code: 'PERF', description: 'Paid ads, retention and growth across every channel' },
  { name: 'Warehouse & Fulfilment', code: 'WHSE', description: 'Inward, picking, packing and dispatch' },
  { name: 'Customer Experience', code: 'CX', description: 'Pre- and post-purchase support, returns and escalations' },
  { name: 'Finance & Accounts', code: 'FIN', description: 'Reconciliation, payouts, GST and payroll' },
  { name: 'People & Culture', code: 'HR', description: 'Hiring, onboarding and employee experience' },
  { name: 'Technology', code: 'TECH', description: 'Storefront, integrations and internal tooling' },
];

const EMPLOYEES: EmployeeSeed[] = [
  // ----- Leadership -----
  {
    code: 'YT-001', firstName: 'Ananya', lastName: 'Rao', designation: 'Founder & CEO',
    department: 'LEAD', gender: 'FEMALE', dob: '1988-04-12', joining: '2019-02-01',
    ctc: 4_800_000, city: 'Bengaluru', state: 'Karnataka',
    login: { role: 'SUPER_ADMIN' },
  },
  {
    code: 'YT-002', firstName: 'Vikram', lastName: 'Shetty', designation: 'Chief Operating Officer',
    department: 'LEAD', gender: 'MALE', dob: '1986-11-03', joining: '2019-06-15',
    ctc: 3_600_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-001',
    channels: [{ channel: 'AMAZON', allocationPct: 25, role: 'Business Owner' }, { channel: 'FLIPKART', allocationPct: 25, role: 'Business Owner' }],
    login: { role: 'MANAGER' },
  },

  // ----- People & Culture -----
  {
    code: 'YT-003', firstName: 'Meera', lastName: 'Krishnan', designation: 'Head of People & Culture',
    department: 'HR', gender: 'FEMALE', dob: '1990-07-22', joining: '2020-01-06',
    ctc: 2_400_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-001',
    login: { role: 'HR_MANAGER' },
  },
  {
    code: 'YT-004', firstName: 'Rohit', lastName: 'Bansal', designation: 'HR Executive',
    department: 'HR', gender: 'MALE', dob: '1996-02-18', joining: '2023-03-13',
    ctc: 680_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-003',
  },

  // ----- Marketplace Operations -----
  {
    code: 'YT-005', firstName: 'Priya', lastName: 'Nair', designation: 'Marketplace Operations Lead',
    department: 'MKTOPS', gender: 'FEMALE', dob: '1991-09-30', joining: '2020-08-17',
    ctc: 1_850_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-002',
    channels: [{ channel: 'AMAZON', allocationPct: 50, isPrimary: true, role: 'Channel Lead' }, { channel: 'FLIPKART', allocationPct: 50, role: 'Channel Lead' }],
    login: { role: 'MANAGER' },
  },
  {
    code: 'YT-006', firstName: 'Arjun', lastName: 'Menon', designation: 'Senior Marketplace Executive',
    department: 'MKTOPS', gender: 'MALE', dob: '1994-01-25', joining: '2021-05-10',
    ctc: 920_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-005',
    channels: [{ channel: 'AMAZON', allocationPct: 100, isPrimary: true, role: 'Account Manager' }],
  },
  {
    code: 'YT-007', firstName: 'Sneha', lastName: 'Deshpande', designation: 'Marketplace Executive',
    department: 'MKTOPS', gender: 'FEMALE', dob: '1997-06-14', joining: '2022-07-04',
    ctc: 720_000, city: 'Pune', state: 'Maharashtra', managerCode: 'YT-005',
    channels: [{ channel: 'FLIPKART', allocationPct: 100, isPrimary: true, role: 'Account Manager' }],
  },
  {
    code: 'YT-008', firstName: 'Kabir', lastName: 'Sinha', designation: 'Marketplace Executive',
    department: 'MKTOPS', gender: 'MALE', dob: '1998-03-08', joining: '2023-01-09',
    ctc: 660_000, city: 'Gurugram', state: 'Haryana', managerCode: 'YT-005',
    channels: [{ channel: 'MYNTRA', allocationPct: 100, isPrimary: true, role: 'Account Manager' }],
  },
  {
    code: 'YT-009', firstName: 'Divya', lastName: 'Iyer', designation: 'Shopify Store Manager',
    department: 'MKTOPS', gender: 'FEMALE', dob: '1993-12-01', joining: '2021-02-15',
    ctc: 1_100_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-005',
    channels: [{ channel: 'SHOPIFY', allocationPct: 100, isPrimary: true, role: 'Store Owner' }],
  },
  {
    code: 'YT-010', firstName: 'Faisal', lastName: 'Khan', designation: 'Inventory Planner',
    department: 'MKTOPS', gender: 'MALE', dob: '1992-08-19', joining: '2022-02-21',
    ctc: 840_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-005',
    channels: [
      { channel: 'AMAZON', allocationPct: 30 },
      { channel: 'FLIPKART', allocationPct: 30 },
      { channel: 'MYNTRA', allocationPct: 20 },
      { channel: 'SHOPIFY', allocationPct: 20 },
    ],
  },

  // ----- Catalogue & Content -----
  {
    code: 'YT-011', firstName: 'Tanvi', lastName: 'Joshi', designation: 'Catalogue Manager',
    department: 'CAT', gender: 'FEMALE', dob: '1992-05-27', joining: '2020-11-02',
    ctc: 1_250_000, city: 'Mumbai', state: 'Maharashtra', managerCode: 'YT-002',
    channels: [{ channel: 'MYNTRA', allocationPct: 40, isPrimary: true, role: 'Catalogue Lead' }, { channel: 'AMAZON', allocationPct: 60, role: 'Catalogue Lead' }],
    login: { role: 'MANAGER' },
  },
  {
    code: 'YT-012', firstName: 'Nikhil', lastName: 'Verma', designation: 'Catalogue Associate',
    department: 'CAT', gender: 'MALE', dob: '1999-10-11', joining: '2023-08-07',
    ctc: 480_000, city: 'Mumbai', state: 'Maharashtra', managerCode: 'YT-011',
    channels: [{ channel: 'AMAZON', allocationPct: 50, isPrimary: true }, { channel: 'FLIPKART', allocationPct: 50 }],
    status: 'PROBATION',
  },
  {
    code: 'YT-013', firstName: 'Aisha', lastName: 'Qureshi', designation: 'Content Writer',
    department: 'CAT', gender: 'FEMALE', dob: '1995-04-02', joining: '2022-09-19',
    ctc: 620_000, city: 'Hyderabad', state: 'Telangana', managerCode: 'YT-011',
    channels: [{ channel: 'SHOPIFY', allocationPct: 60, isPrimary: true }, { channel: 'MYNTRA', allocationPct: 40 }],
  },
  {
    code: 'YT-014', firstName: 'Harsh', lastName: 'Patel', designation: 'Product Photographer',
    department: 'CAT', gender: 'MALE', dob: '1994-07-16', joining: '2021-10-11',
    ctc: 560_000, city: 'Ahmedabad', state: 'Gujarat', managerCode: 'YT-011',
    employmentType: 'CONTRACT',
    channels: [{ channel: 'MYNTRA', allocationPct: 50, isPrimary: true }, { channel: 'SHOPIFY', allocationPct: 50 }],
  },

  // ----- Performance Marketing -----
  {
    code: 'YT-015', firstName: 'Shreya', lastName: 'Gupta', designation: 'Performance Marketing Lead',
    department: 'PERF', gender: 'FEMALE', dob: '1991-03-21', joining: '2020-07-13',
    ctc: 1_950_000, city: 'Gurugram', state: 'Haryana', managerCode: 'YT-001',
    channels: [{ channel: 'SHOPIFY', allocationPct: 50, isPrimary: true, role: 'Growth Owner' }, { channel: 'AMAZON', allocationPct: 50, role: 'Ads Lead' }],
    login: { role: 'MANAGER' },
  },
  {
    code: 'YT-016', firstName: 'Aditya', lastName: 'Kulkarni', designation: 'Amazon Ads Specialist',
    department: 'PERF', gender: 'MALE', dob: '1996-11-28', joining: '2022-04-18',
    ctc: 980_000, city: 'Pune', state: 'Maharashtra', managerCode: 'YT-015',
    channels: [{ channel: 'AMAZON', allocationPct: 100, isPrimary: true, role: 'Ads Manager' }],
  },
  {
    code: 'YT-017', firstName: 'Ritika', lastName: 'Sharma', designation: 'Paid Social Specialist',
    department: 'PERF', gender: 'FEMALE', dob: '1997-01-07', joining: '2023-02-06',
    ctc: 780_000, city: 'Gurugram', state: 'Haryana', managerCode: 'YT-015',
    channels: [{ channel: 'SHOPIFY', allocationPct: 100, isPrimary: true, role: 'Ads Manager' }],
  },
  {
    code: 'YT-018', firstName: 'Manish', lastName: 'Tiwari', designation: 'Marketplace Ads Executive',
    department: 'PERF', gender: 'MALE', dob: '1998-09-23', joining: '2023-11-20',
    ctc: 540_000, city: 'Noida', state: 'Uttar Pradesh', managerCode: 'YT-015',
    channels: [{ channel: 'FLIPKART', allocationPct: 60, isPrimary: true }, { channel: 'MYNTRA', allocationPct: 40 }],
  },

  // ----- Warehouse & Fulfilment -----
  {
    code: 'YT-019', firstName: 'Suresh', lastName: 'Yadav', designation: 'Warehouse Manager',
    department: 'WHSE', gender: 'MALE', dob: '1985-06-05', joining: '2019-09-02',
    ctc: 1_150_000, city: 'Bhiwandi', state: 'Maharashtra', managerCode: 'YT-002',
    login: { role: 'MANAGER' },
  },
  {
    code: 'YT-020', firstName: 'Lakshmi', lastName: 'Pillai', designation: 'Fulfilment Supervisor',
    department: 'WHSE', gender: 'FEMALE', dob: '1993-02-14', joining: '2021-01-18',
    ctc: 620_000, city: 'Bhiwandi', state: 'Maharashtra', managerCode: 'YT-019',
    channels: [{ channel: 'SHOPIFY', allocationPct: 100, isPrimary: true, role: 'D2C Dispatch' }],
  },
  {
    code: 'YT-021', firstName: 'Ramesh', lastName: 'Gowda', designation: 'Inward Executive',
    department: 'WHSE', gender: 'MALE', dob: '1996-12-09', joining: '2022-06-06',
    ctc: 390_000, city: 'Bhiwandi', state: 'Maharashtra', managerCode: 'YT-019',
  },
  {
    code: 'YT-022', firstName: 'Pooja', lastName: 'Chauhan', designation: 'Packing Associate',
    department: 'WHSE', gender: 'FEMALE', dob: '2000-05-19', joining: '2024-01-15',
    ctc: 324_000, city: 'Bhiwandi', state: 'Maharashtra', managerCode: 'YT-020',
    employmentType: 'PART_TIME',
  },

  // ----- Customer Experience -----
  {
    code: 'YT-023', firstName: 'Neha', lastName: 'Agarwal', designation: 'Customer Experience Lead',
    department: 'CX', gender: 'FEMALE', dob: '1992-10-04', joining: '2020-10-05',
    ctc: 1_080_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-002',
    channels: [
      { channel: 'SHOPIFY', allocationPct: 40, isPrimary: true, role: 'CX Owner' },
      { channel: 'AMAZON', allocationPct: 30 },
      { channel: 'FLIPKART', allocationPct: 30 },
    ],
    login: { role: 'MANAGER' },
  },
  {
    code: 'YT-024', firstName: 'Imran', lastName: 'Shaikh', designation: 'Support Executive',
    department: 'CX', gender: 'MALE', dob: '1999-08-12', joining: '2023-05-22',
    ctc: 420_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-023',
    channels: [{ channel: 'AMAZON', allocationPct: 50, isPrimary: true }, { channel: 'MYNTRA', allocationPct: 50 }],
  },
  {
    code: 'YT-025', firstName: 'Swati', lastName: 'Mishra', designation: 'Returns Specialist',
    department: 'CX', gender: 'FEMALE', dob: '1995-11-17', joining: '2022-11-14',
    ctc: 460_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-023',
    channels: [{ channel: 'FLIPKART', allocationPct: 50, isPrimary: true }, { channel: 'MYNTRA', allocationPct: 50 }],
    status: 'NOTICE_PERIOD',
  },

  // ----- Finance -----
  {
    code: 'YT-026', firstName: 'Girish', lastName: 'Hegde', designation: 'Finance Manager',
    department: 'FIN', gender: 'MALE', dob: '1987-01-30', joining: '2020-03-02',
    ctc: 1_680_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-001',
    login: { role: 'MANAGER' },
  },
  {
    code: 'YT-027', firstName: 'Bhavna', lastName: 'Shah', designation: 'Reconciliation Analyst',
    department: 'FIN', gender: 'FEMALE', dob: '1996-04-24', joining: '2022-08-08',
    ctc: 740_000, city: 'Bengaluru', state: 'Karnataka', managerCode: 'YT-026',
    channels: [
      { channel: 'AMAZON', allocationPct: 35, isPrimary: true, role: 'Payout Reconciliation' },
      { channel: 'FLIPKART', allocationPct: 35 },
      { channel: 'MYNTRA', allocationPct: 30 },
    ],
  },

  // ----- Technology -----
  {
    code: 'YT-028', firstName: 'Karthik', lastName: 'Subramanian', designation: 'Full-stack Engineer',
    department: 'TECH', gender: 'MALE', dob: '1994-09-09', joining: '2021-07-26',
    ctc: 2_100_000, city: 'Chennai', state: 'Tamil Nadu', managerCode: 'YT-001',
    channels: [{ channel: 'SHOPIFY', allocationPct: 70, isPrimary: true, role: 'Storefront & Integrations' }, { channel: 'AMAZON', allocationPct: 30, role: 'SP-API Integrations' }],
    login: { role: 'EMPLOYEE' },
  },
];

const LEAVE_TYPES = [
  { name: 'Earned Leave', code: 'EL', annualQuota: 18, isPaid: true, colorHex: '#6366f1', description: 'Accrued paid time off' },
  { name: 'Casual Leave', code: 'CL', annualQuota: 8, isPaid: true, colorHex: '#06b6d4', description: 'Short-notice personal leave' },
  { name: 'Sick Leave', code: 'SL', annualQuota: 10, isPaid: true, colorHex: '#f59e0b', description: 'Medical leave' },
  { name: 'Loss of Pay', code: 'LOP', annualQuota: 0, isPaid: false, colorHex: '#ef4444', description: 'Unpaid leave' },
  { name: 'Maternity Leave', code: 'ML', annualQuota: 182, isPaid: true, colorHex: '#ec4899', description: 'Statutory maternity leave' },
  { name: 'Paternity Leave', code: 'PL', annualQuota: 10, isPaid: true, colorHex: '#8b5cf6', description: 'Paternity leave' },
];

const HOLIDAYS_2026 = [
  { name: 'New Year’s Day', date: '2026-01-01', isOptional: false },
  { name: 'Republic Day', date: '2026-01-26', isOptional: false },
  { name: 'Holi', date: '2026-03-04', isOptional: false },
  { name: 'Good Friday', date: '2026-04-03', isOptional: true },
  { name: 'Independence Day', date: '2026-08-15', isOptional: false },
  { name: 'Ganesh Chaturthi', date: '2026-09-14', isOptional: true },
  { name: 'Gandhi Jayanti', date: '2026-10-02', isOptional: false },
  { name: 'Dussehra', date: '2026-10-20', isOptional: false },
  { name: 'Diwali', date: '2026-11-08', isOptional: false },
  { name: 'Diwali (Govardhan Puja)', date: '2026-11-09', isOptional: true },
  { name: 'Christmas Day', date: '2026-12-25', isOptional: false },
];

async function main(): Promise<void> {
  console.log('[seed] clearing existing data…');

  // Order matters: children before parents.
  await prisma.payslip.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.channelAssignment.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.department.updateMany({ data: { headId: null } });
  await prisma.employee.updateMany({ data: { managerId: null } });
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  // ----- Root admin ---------------------------------------------------------
  console.log('[seed] creating root administrator…');
  const adminPasswordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
  const rootAdmin = await prisma.user.create({
    data: { email: env.SEED_ADMIN_EMAIL, passwordHash: adminPasswordHash, role: 'SUPER_ADMIN' },
  });

  // ----- Departments --------------------------------------------------------
  console.log('[seed] creating departments…');
  const departmentByCode = new Map<string, string>();
  for (const department of DEPARTMENTS) {
    const created = await prisma.department.create({ data: department });
    departmentByCode.set(created.code, created.id);
  }

  // ----- Leave types --------------------------------------------------------
  console.log('[seed] creating leave types…');
  const leaveTypeByCode = new Map<string, { id: string; annualQuota: number }>();
  for (const leaveType of LEAVE_TYPES) {
    const created = await prisma.leaveType.create({ data: leaveType });
    leaveTypeByCode.set(created.code, { id: created.id, annualQuota: created.annualQuota });
  }

  // ----- Holidays -----------------------------------------------------------
  console.log('[seed] creating holiday calendar…');
  await prisma.holiday.createMany({
    data: HOLIDAYS_2026.map((holiday) => ({
      name: holiday.name,
      date: toDateOnly(holiday.date),
      isOptional: holiday.isOptional,
    })),
  });

  // ----- Employees (two passes so managers can be wired up) -----------------
  console.log(`[seed] creating ${EMPLOYEES.length} employees…`);
  const defaultPasswordHash = await hashPassword(env.SEED_DEFAULT_PASSWORD);
  const employeeIdByCode = new Map<string, string>();

  for (const seed of EMPLOYEES) {
    let userId: string | null = null;

    if (seed.login) {
      const user = await prisma.user.create({
        data: {
          email: `${seed.firstName.toLowerCase()}.${seed.lastName.toLowerCase()}@youteam.in`,
          passwordHash: defaultPasswordHash,
          role: seed.login.role,
        },
      });
      userId = user.id;
    }

    const created = await prisma.employee.create({
      data: {
        employeeCode: seed.code,
        firstName: seed.firstName,
        lastName: seed.lastName,
        workEmail: `${seed.firstName.toLowerCase()}.${seed.lastName.toLowerCase()}@youteam.in`,
        phone: `+91 ${String(90000 + Math.floor(random() * 9999))}${String(10000 + Math.floor(random() * 89999))}`,
        gender: seed.gender,
        dateOfBirth: toDateOnly(seed.dob),
        city: seed.city,
        state: seed.state,
        country: 'India',
        designation: seed.designation,
        employmentType: seed.employmentType ?? 'FULL_TIME',
        status: seed.status ?? 'ACTIVE',
        joiningDate: toDateOnly(seed.joining),
        ctcAnnual: new Prisma.Decimal(seed.ctc),
        departmentId: departmentByCode.get(seed.department) ?? null,
        userId,
        channelAssignments: {
          create: (seed.channels ?? []).map((channel) => ({
            channel: channel.channel,
            allocationPct: channel.allocationPct,
            isPrimary: channel.isPrimary ?? false,
            channelRole: channel.role ?? null,
            startedAt: toDateOnly(seed.joining),
          })),
        },
      },
    });

    employeeIdByCode.set(seed.code, created.id);
  }

  console.log('[seed] wiring up the reporting hierarchy…');
  for (const seed of EMPLOYEES) {
    if (!seed.managerCode) continue;
    await prisma.employee.update({
      where: { id: employeeIdByCode.get(seed.code)! },
      data: { managerId: employeeIdByCode.get(seed.managerCode)! },
    });
  }

  // Department heads
  const headByDepartment: Record<string, string> = {
    LEAD: 'YT-001',
    MKTOPS: 'YT-005',
    CAT: 'YT-011',
    PERF: 'YT-015',
    WHSE: 'YT-019',
    CX: 'YT-023',
    FIN: 'YT-026',
    HR: 'YT-003',
    TECH: 'YT-028',
  };
  for (const [code, employeeCode] of Object.entries(headByDepartment)) {
    await prisma.department.update({
      where: { id: departmentByCode.get(code)! },
      data: { headId: employeeIdByCode.get(employeeCode)! },
    });
  }

  // ----- Leave balances -----------------------------------------------------
  console.log('[seed] allocating leave balances…');
  const year = new Date().getUTCFullYear();
  const allEmployeeIds = [...employeeIdByCode.values()];

  await prisma.leaveBalance.createMany({
    data: allEmployeeIds.flatMap((employeeId) =>
      [...leaveTypeByCode.values()].map((leaveType) => ({
        employeeId,
        leaveTypeId: leaveType.id,
        year,
        entitled: leaveType.annualQuota,
        used: 0,
      })),
    ),
  });

  // ----- Attendance for the last two months --------------------------------
  console.log('[seed] generating attendance history…');
  const holidayDates = new Set(HOLIDAYS_2026.map((holiday) => holiday.date));
  const now = new Date();
  const attendanceRows: {
    employeeId: string;
    date: Date;
    status: AttendanceStatus;
    checkIn: Date | null;
    checkOut: Date | null;
    workedMinutes: number;
  }[] = [];

  const startOfWindow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const endOfWindow = toDateOnly(now);

  for (
    let cursor = new Date(startOfWindow);
    cursor <= endOfWindow;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = new Date(cursor);
    const iso = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();

    for (const [code, employeeId] of employeeIdByCode) {
      const seed = EMPLOYEES.find((candidate) => candidate.code === code)!;
      // Skip days before the person joined.
      if (toDateOnly(seed.joining) > date) continue;

      if (weekday === 0 || weekday === 6) {
        attendanceRows.push({ employeeId, date, status: 'WEEK_OFF', checkIn: null, checkOut: null, workedMinutes: 0 });
        continue;
      }

      if (holidayDates.has(iso)) {
        attendanceRows.push({ employeeId, date, status: 'HOLIDAY', checkIn: null, checkOut: null, workedMinutes: 0 });
        continue;
      }

      const roll = random();
      let status: AttendanceStatus;
      if (roll < 0.86) status = 'PRESENT';
      else if (roll < 0.93) status = 'WORK_FROM_HOME';
      else if (roll < 0.96) status = 'ON_LEAVE';
      else if (roll < 0.98) status = 'HALF_DAY';
      else status = 'ABSENT';

      if (status === 'PRESENT' || status === 'WORK_FROM_HOME' || status === 'HALF_DAY') {
        const startHour = 9 + Math.floor(random() * 2);
        const startMinute = Math.floor(random() * 60);
        const checkIn = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), startHour - 5, startMinute - 30),
        );
        const workedMinutes = status === 'HALF_DAY' ? 180 + Math.floor(random() * 50) : 480 + Math.floor(random() * 90);
        const checkOut = new Date(checkIn.getTime() + workedMinutes * 60_000);
        attendanceRows.push({ employeeId, date, status, checkIn, checkOut, workedMinutes });
      } else {
        attendanceRows.push({ employeeId, date, status, checkIn: null, checkOut: null, workedMinutes: 0 });
      }
    }
  }

  // Chunked to stay well inside PostgreSQL's parameter limit.
  for (let index = 0; index < attendanceRows.length; index += 1000) {
    await prisma.attendance.createMany({ data: attendanceRows.slice(index, index + 1000) });
  }
  console.log(`[seed]   ${attendanceRows.length} attendance rows`);

  // ----- Leave requests in every state -------------------------------------
  console.log('[seed] creating leave requests…');
  const el = leaveTypeByCode.get('EL')!;
  const cl = leaveTypeByCode.get('CL')!;
  const sl = leaveTypeByCode.get('SL')!;

  const leaveSeeds: {
    code: string;
    type: { id: string };
    start: string;
    end: string;
    days: number;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  }[] = [
    { code: 'YT-006', type: el, start: iso(addMonths(now, 1), 6), end: iso(addMonths(now, 1), 10), days: 5, reason: 'Family wedding in Kochi', status: 'PENDING' },
    { code: 'YT-012', type: cl, start: iso(addMonths(now, 1), 3), end: iso(addMonths(now, 1), 3), days: 1, reason: 'Apartment registration paperwork', status: 'PENDING' },
    { code: 'YT-017', type: sl, start: iso(now, 2), end: iso(now, 3), days: 2, reason: 'Viral fever, doctor advised rest', status: 'PENDING' },
    { code: 'YT-024', type: el, start: iso(addMonths(now, 1), 16), end: iso(addMonths(now, 1), 20), days: 5, reason: 'Pre-planned trip to Manali', status: 'PENDING' },
    { code: 'YT-007', type: el, start: iso(addMonths(now, -1), 12), end: iso(addMonths(now, -1), 14), days: 3, reason: 'Diwali travel to hometown', status: 'APPROVED' },
    { code: 'YT-016', type: sl, start: iso(addMonths(now, -1), 20), end: iso(addMonths(now, -1), 21), days: 2, reason: 'Dental procedure', status: 'APPROVED' },
    { code: 'YT-021', type: cl, start: iso(addMonths(now, -1), 25), end: iso(addMonths(now, -1), 25), days: 1, reason: 'Personal errand', status: 'APPROVED' },
    { code: 'YT-013', type: el, start: iso(addMonths(now, 2), 2), end: iso(addMonths(now, 2), 13), days: 10, reason: 'Extended holiday abroad', status: 'REJECTED' },
    { code: 'YT-022', type: cl, start: iso(now, 9), end: iso(now, 9), days: 1, reason: 'Changed plans', status: 'CANCELLED' },
  ];

  for (const leave of leaveSeeds) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: employeeIdByCode.get(leave.code)!,
        leaveTypeId: leave.type.id,
        startDate: toDateOnly(leave.start),
        endDate: toDateOnly(leave.end),
        days: leave.days,
        reason: leave.reason,
        status: leave.status,
        ...(leave.status === 'APPROVED' || leave.status === 'REJECTED'
          ? {
              decidedById: rootAdmin.id,
              decidedAt: new Date(),
              decisionNote:
                leave.status === 'APPROVED'
                  ? 'Approved — cover arranged with the team.'
                  : 'Cannot approve during the festive sale peak. Please re-plan for January.',
            }
          : {}),
      },
    });

    if (leave.status === 'APPROVED') {
      await prisma.leaveBalance.updateMany({
        where: {
          employeeId: employeeIdByCode.get(leave.code)!,
          leaveTypeId: leave.type.id,
          year,
        },
        data: { used: { increment: leave.days } },
      });
    }
  }

  // ----- One approved payroll run for last month ---------------------------
  console.log('[seed] running payroll for last month…');
  const lastMonth = addMonths(now, -1);
  const payrollMonth = lastMonth.getUTCMonth() + 1;
  const payrollYear = lastMonth.getUTCFullYear();
  const totalDays = daysInMonth(payrollYear, payrollMonth);
  const { start: payStart, end: payEnd } = monthBounds(payrollYear, payrollMonth);

  const payrollRun = await prisma.payrollRun.create({
    data: {
      month: payrollMonth,
      year: payrollYear,
      status: 'PAID',
      processedAt: new Date(),
      paidAt: new Date(),
      notes: 'Processed and disbursed via HDFC corporate salary account.',
    },
  });

  const lopCounts = await prisma.attendance.groupBy({
    by: ['employeeId', 'status'],
    where: { date: { gte: payStart, lte: payEnd }, status: { in: ['ABSENT', 'HALF_DAY'] } },
    _count: { _all: true },
  });

  const lopByEmployee = new Map<string, number>();
  for (const row of lopCounts) {
    const weight = row.status === 'HALF_DAY' ? 0.5 : 1;
    lopByEmployee.set(row.employeeId, (lopByEmployee.get(row.employeeId) ?? 0) + row._count._all * weight);
  }

  const payableEmployees = await prisma.employee.findMany({
    where: { joiningDate: { lte: payEnd } },
    select: { id: true, ctcAnnual: true },
  });

  await prisma.payslip.createMany({
    data: payableEmployees.map((employee) => {
      const computed = computePayslip({
        annualCtc: Number(employee.ctcAnnual),
        totalDaysInMonth: totalDays,
        lopDays: lopByEmployee.get(employee.id) ?? 0,
      });

      return {
        payrollRunId: payrollRun.id,
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
    }),
  });

  // ----- Announcements ------------------------------------------------------
  console.log('[seed] posting announcements…');
  await prisma.announcement.createMany({
    data: [
      {
        title: 'Festive sale readiness — all channels',
        body: 'Amazon Great Indian Festival and Flipkart Big Billion Days overlap this year. Catalogue freeze is two weeks before launch; no listing edits after that without sign-off from Priya. Warehouse moves to extended shifts for the sale window — Suresh will share the roster.',
        pinned: true,
        authorId: rootAdmin.id,
      },
      {
        title: 'Myntra EORS onboarding complete',
        body: 'We are now live on Myntra End of Reason Sale. Kabir owns the channel; reach out to him for anything listing or pricing related.',
        channel: 'MYNTRA',
        authorId: rootAdmin.id,
      },
      {
        title: 'Shopify theme refresh ships Monday',
        body: 'Karthik has rebuilt the PDP with the new size guide and review widget. Expect a short deploy window Monday 7–8am IST. Report anything odd in #storefront.',
        channel: 'SHOPIFY',
        authorId: rootAdmin.id,
      },
      {
        title: 'Payroll cut-off moved to the 25th',
        body: 'From this month, attendance corrections and expense claims must be in by the 25th. Anything later rolls into the following month’s payroll.',
        authorId: rootAdmin.id,
      },
    ],
  });

  // ----- Summary ------------------------------------------------------------
  const counts = {
    users: await prisma.user.count(),
    employees: await prisma.employee.count(),
    departments: await prisma.department.count(),
    channelAssignments: await prisma.channelAssignment.count(),
    attendance: await prisma.attendance.count(),
    leaveRequests: await prisma.leaveRequest.count(),
    payslips: await prisma.payslip.count(),
    holidays: await prisma.holiday.count(),
  };

  console.log('\n[seed] done:');
  for (const [key, value] of Object.entries(counts)) {
    console.log(`         ${key.padEnd(20)} ${value}`);
  }

  // Width is derived rather than hard-coded, so changing the email domain does
  // not silently break the alignment of this table.
  const logins: [string, string, string][] = [
    [env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD, 'SUPER_ADMIN'],
    ['meera.krishnan@youteam.in', env.SEED_DEFAULT_PASSWORD, 'HR_MANAGER'],
    ['priya.nair@youteam.in', env.SEED_DEFAULT_PASSWORD, 'MANAGER'],
    ['karthik.subramanian@youteam.in', env.SEED_DEFAULT_PASSWORD, 'EMPLOYEE'],
  ];
  const emailWidth = Math.max(...logins.map(([email]) => email.length)) + 2;
  const passwordWidth = Math.max(...logins.map(([, password]) => password.length)) + 2;

  console.log('\n[seed] sign in with any of these:');
  for (const [email, password, role] of logins) {
    console.log(
      `         ${email.padEnd(emailWidth)}${password.padEnd(passwordWidth)}(${role})`,
    );
  }
  console.log('');
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** `YYYY-MM-DD` for the given day-of-month within `date`'s month. */
function iso(date: Date, dayOfMonth: number): string {
  const clamped = Math.min(dayOfMonth, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), clamped))
    .toISOString()
    .slice(0, 10);
}

main()
  .catch((error) => {
    console.error('\n[seed] failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
