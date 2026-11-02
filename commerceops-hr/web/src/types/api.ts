/** Mirrors the server's Prisma enums and response shapes. */

export type Role = 'SUPER_ADMIN' | 'HR_MANAGER' | 'MANAGER' | 'EMPLOYEE';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'FREELANCE';

export type EmployeeStatus =
  | 'ACTIVE'
  | 'PROBATION'
  | 'ON_LEAVE'
  | 'NOTICE_PERIOD'
  | 'RESIGNED'
  | 'TERMINATED';

export type SalesChannel = 'SHOPIFY' | 'AMAZON' | 'FLIPKART' | 'MYNTRA';

export type AttendanceStatus =
  | 'PRESENT'
  | 'WORK_FROM_HOME'
  | 'HALF_DAY'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEK_OFF'
  | 'MISSING_CHECKOUT';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type WorkLocation = 'OFFICE' | 'HOME' | 'OTHER';

export type WorkReportStatus = 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';

export interface WorkReport {
  id: string;
  attendanceId: string;
  details: string;
  status: WorkReportStatus;
  createdAt: string;
  updatedAt: string;
}

export type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface Envelope<T> {
  data: T;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  employeeId: string | null;
  fullName: string;
  designation: string | null;
  department: { id: string; name: string } | null;
  avatarUrl: string | null;
}

export interface LoginResponse {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

export interface DepartmentRef {
  id: string;
  name: string;
  code?: string;
}

export interface ChannelAssignment {
  id?: string;
  channel: SalesChannel;
  allocationPct: number;
  isPrimary: boolean;
  channelRole: string | null;
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string | null;
  avatarUrl: string | null;
  designation: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  joiningDate: string;
  ctcAnnual: number;
  department: DepartmentRef | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  channelAssignments: ChannelAssignment[];
}

export interface LeaveBalanceRow {
  id?: string;
  year: number;
  entitled: number;
  used: number;
  available?: number;
  leaveType: {
    id: string;
    name: string;
    code: string;
    colorHex: string;
    isPaid?: boolean;
  };
}

export interface EmployeeDetail extends Omit<EmployeeListItem, 'manager'> {
  personalEmail: string | null;
  gender: Gender;
  dateOfBirth: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string;
  exitDate: string | null;
  departmentId: string | null;
  managerId: string | null;
  manager: {
    id: string;
    firstName: string;
    lastName: string;
    designation: string;
    avatarUrl: string | null;
  } | null;
  reports: {
    id: string;
    firstName: string;
    lastName: string;
    designation: string;
    avatarUrl: string | null;
  }[];
  user: {
    id: string;
    email: string;
    role: Role;
    isActive: boolean;
    lastLoginAt: string | null;
  } | null;
  leaveBalances: LeaveBalanceRow[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation: string;
  avatarUrl: string | null;
  department: DepartmentRef | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  headId: string | null;
  head: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  headcount: number;
  annualPayrollCost: number;
  createdAt: string;
}

export interface DepartmentDetail extends Omit<Department, 'headcount' | 'annualPayrollCost'> {
  employees: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    designation: string;
    status: EmployeeStatus;
    avatarUrl: string | null;
  }[];
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  /** UTC instants; always rendered in Asia/Kolkata. */
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  workedMinutes: number;
  notes: string | null;
  correctedAt: string | null;
  correctionReason: string | null;
  correctedBy: { id: string; email: string } | null;
  workLocation: WorkLocation | null;
  workLocationDetail: string | null;
  workReports: WorkReport[];
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    designation: string;
    department: DepartmentRef | null;
  };
}

/** Everything the attendance card needs, derived server-side. */
export interface TodayAttendance {
  /** The Asia/Kolkata calendar day the server is recording against. */
  businessDate: string;
  serverTime: string;
  timeZone: 'Asia/Kolkata';
  record: AttendanceRecord | null;
  isWorking: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  elapsedMinutes: number;
  /** Reports are editable only between check-in and check-out. */
  canEditWorkReports: boolean;
  workReportsLocked: boolean;
}

export interface AttendanceSummary {
  year: number;
  month: number;
  headcount: number;
  byStatus: { status: AttendanceStatus; count: number }[];
  series: { date: string; present: number; absent: number; onLeave: number }[];
  totalWorkedHours: number;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  annualQuota: number;
  isPaid: boolean;
  colorHex: string;
  description: string | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    designation: string;
    department: DepartmentRef | null;
    manager: { id: string; firstName: string; lastName: string } | null;
  };
  leaveType: { id: string; name: string; code: string; colorHex: string; isPaid: boolean };
  decidedBy: { id: string; email: string } | null;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  notes: string | null;
  processedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  employeeCount: number;
  totalNetPay: number;
  totalGross: number;
  totalDeductions: number;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
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

export interface PayslipWithEmployee extends Payslip {
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    designation: string;
    avatarUrl: string | null;
    department: DepartmentRef | null;
  };
}

export interface PayslipWithRun extends Payslip {
  payrollRun: {
    id: string;
    month: number;
    year: number;
    status: PayrollStatus;
    paidAt: string | null;
  };
}

export interface PayrollRunDetail {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  notes: string | null;
  processedAt: string | null;
  paidAt: string | null;
  payslips: PayslipWithEmployee[];
  totals: { gross: number; deductions: number; net: number };
}

export interface ChannelOverview {
  channel: SalesChannel;
  label: string;
  accent: string;
  kind: string;
  headcount: number;
  fte: number;
  allocatedAnnualCost: number;
  primaryOwners: {
    id: string;
    name: string;
    designation: string;
    avatarUrl: string | null;
    channelRole: string | null;
  }[];
  team: {
    id: string;
    employeeCode: string;
    name: string;
    designation: string;
    avatarUrl: string | null;
    department: DepartmentRef | null;
    allocationPct: number;
    channelRole: string | null;
    isPrimary: boolean;
  }[];
}

export interface DashboardOverview {
  kpis: {
    totalEmployees: number;
    activeEmployees: number;
    onProbation: number;
    onNotice: number;
    joinedThisMonth: number;
    departments: number;
    pendingLeaveApprovals: number;
    presentToday: number;
    absentToday: number;
    onLeaveToday: number;
    attendanceRate: number;
    annualPayrollCost: number;
    averageCtc: number;
  };
  employmentTypeMix: { employmentType: EmploymentType; count: number }[];
  departmentMix: { departmentId: string | null; name: string; code: string; count: number }[];
  channelStaffing: { channel: SalesChannel; headcount: number; fte: number }[];
  headcountTrend: { month: string; headcount: number }[];
  recentHires: {
    id: string;
    firstName: string;
    lastName: string;
    designation: string;
    avatarUrl: string | null;
    joiningDate: string;
    department: { name: string } | null;
  }[];
  upcomingHolidays: { id: string; name: string; date: string; isOptional: boolean }[];
  announcements: {
    id: string;
    title: string;
    body: string;
    channel: SalesChannel | null;
    pinned: boolean;
    createdAt: string;
    author: { email: string };
  }[];
  celebrations: {
    employeeId: string;
    name: string;
    avatarUrl: string | null;
    designation: string;
    type: 'BIRTHDAY' | 'ANNIVERSARY';
    date: string;
    years?: number;
  }[];
}

export interface AppUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    designation: string;
    avatarUrl: string | null;
    department: DepartmentRef | null;
  } | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; email: string } | null;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  isOptional: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  channel: SalesChannel | null;
  pinned: boolean;
  createdAt: string;
  author: { id: string; email: string };
}
