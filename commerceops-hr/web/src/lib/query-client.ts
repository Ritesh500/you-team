import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        // Auth and validation failures will not succeed on a retry.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Query keys in one place, so invalidation never guesses. */
export const queryKeys = {
  dashboard: ['dashboard'] as const,
  employees: (filters?: unknown) => ['employees', filters ?? {}] as const,
  employee: (id: string) => ['employee', id] as const,
  employeeOptions: ['employee-options'] as const,
  departments: ['departments'] as const,
  department: (id: string) => ['department', id] as const,
  attendance: (filters?: unknown) => ['attendance', filters ?? {}] as const,
  attendanceToday: ['attendance', 'today'] as const,
  attendanceExceptions: ['attendance', 'exceptions'] as const,
  attendanceSummary: (year: number, month: number, employeeId?: string) =>
    ['attendance', 'summary', year, month, employeeId ?? null] as const,
  leaveTypes: ['leave-types'] as const,
  leaveRequests: (filters?: unknown) => ['leave-requests', filters ?? {}] as const,
  leaveBalances: (employeeId?: string, year?: number) =>
    ['leave-balances', employeeId ?? 'self', year ?? null] as const,
  payrollRuns: ['payroll-runs'] as const,
  payrollRun: (id: string) => ['payroll-run', id] as const,
  payslips: (employeeId?: string) => ['payslips', employeeId ?? 'self'] as const,
  channels: ['channels'] as const,
  users: ['users'] as const,
  auditLog: ['audit-log'] as const,
  holidays: (year?: number) => ['holidays', year ?? null] as const,
  announcements: ['announcements'] as const,
};
