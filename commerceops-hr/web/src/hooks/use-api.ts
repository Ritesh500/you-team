import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, cleanParams } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth';
import { formatDuration, formatTime } from '@/lib/utils';
import type {
  Announcement,
  AppUser,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSummary,
  AuditLogEntry,
  ChannelOverview,
  DashboardOverview,
  Department,
  DepartmentDetail,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeOption,
  Envelope,
  Holiday,
  LeaveBalanceRow,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Paginated,
  PayrollRun,
  PayrollRunDetail,
  PayslipWithRun,
  SalesChannel,
  TodayAttendance,
  WorkLocation,
  WorkReportStatus,
} from '@/types/api';

/**
 * "Me"-scoped endpoints (own balances, payslips, today's attendance) require a
 * login that is linked to an employee record. The root admin is not, so these
 * hooks must stay idle for them rather than firing a request that 403s.
 */
function useSelfEmployeeId(): string | null {
  return useAuthStore((state) => state.user?.employeeId ?? null);
}

/** Surfaces an API error as a toast, including the first field message. */
export function toastError(error: unknown, fallback = 'Something went wrong'): void {
  if (error instanceof ApiError) {
    const field = error.fieldErrors[0];
    toast.error(error.message, {
      description: field ? `${field.field}: ${field.message}` : undefined,
    });
    return;
  }
  toast.error(fallback);
}

// ----------------------------- Dashboard -----------------------------------

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => {
      const { data } = await api.get<Envelope<DashboardOverview>>('/dashboard/overview');
      return data.data;
    },
  });
}

// ----------------------------- Employees -----------------------------------

export interface EmployeeFilters {
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  status?: string;
  employmentType?: string;
  channel?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: queryKeys.employees(filters),
    queryFn: async () => {
      const { data } = await api.get<Paginated<EmployeeListItem>>('/employees', {
        params: cleanParams(filters),
      });
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.employee(id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<Envelope<EmployeeDetail>>(`/employees/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function useEmployeeOptions() {
  return useQuery({
    queryKey: queryKeys.employeeOptions,
    queryFn: async () => {
      const { data } = await api.get<Envelope<EmployeeOption[]>>('/employees/options');
      return data.data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Invalidate everything an employee change can affect. */
function useInvalidateEmployeeViews() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    void queryClient.invalidateQueries({ queryKey: ['employee'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.employeeOptions });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    void queryClient.invalidateQueries({ queryKey: queryKeys.departments });
    void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
  };
}

export function useCreateEmployee() {
  const invalidate = useInvalidateEmployeeViews();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post<Envelope<EmployeeListItem>>('/employees', payload);
      return data.data;
    },
    onSuccess(employee) {
      invalidate();
      toast.success(`${employee.firstName} ${employee.lastName} added`, {
        description: `Employee code ${employee.employeeCode}`,
      });
    },
    onError: (error) => toastError(error, 'Could not add the employee'),
  });
}

export function useUpdateEmployee() {
  const invalidate = useInvalidateEmployeeViews();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await api.patch<Envelope<EmployeeListItem>>(`/employees/${id}`, payload);
      return data.data;
    },
    onSuccess() {
      invalidate();
      toast.success('Changes saved');
    },
    onError: (error) => toastError(error, 'Could not save the changes'),
  });
}

export function useDeleteEmployee() {
  const invalidate = useInvalidateEmployeeViews();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/employees/${id}`);
    },
    onSuccess() {
      invalidate();
      toast.success('Employee removed');
    },
    onError: (error) => toastError(error, 'Could not remove the employee'),
  });
}

// ----------------------------- Departments ---------------------------------

export function useDepartments() {
  return useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () => {
      const { data } = await api.get<Envelope<Department[]>>('/departments');
      return data.data;
    },
  });
}

export function useDepartment(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.department(id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<Envelope<DepartmentDetail>>(`/departments/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function useSaveDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: Record<string, unknown> }) => {
      const { data } = id
        ? await api.patch<Envelope<Department>>(`/departments/${id}`, payload)
        : await api.post<Envelope<Department>>('/departments', payload);
      return data.data;
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success(variables.id ? 'Department updated' : 'Department created');
    },
    onError: (error) => toastError(error, 'Could not save the department'),
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/departments/${id}`);
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success('Department deleted');
    },
    onError: (error) => toastError(error, 'Could not delete the department'),
  });
}

// ----------------------------- Attendance ----------------------------------

export interface AttendanceFilters {
  page: number;
  pageSize: number;
  employeeId?: string;
  departmentId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export function useAttendance(filters: AttendanceFilters) {
  return useQuery({
    queryKey: queryKeys.attendance(filters),
    queryFn: async () => {
      const { data } = await api.get<Paginated<AttendanceRecord>>('/attendance', {
        params: cleanParams(filters),
      });
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useAttendanceToday() {
  const selfEmployeeId = useSelfEmployeeId();

  return useQuery({
    queryKey: queryKeys.attendanceToday,
    queryFn: async () => {
      const { data } = await api.get<Envelope<TodayAttendance>>('/attendance/today');
      return data.data;
    },
    enabled: Boolean(selfEmployeeId),
    // The server is the source of truth for whether a punch landed, so re-check
    // when the tab regains focus rather than trusting stale local state.
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/** Open "missing check-out" records awaiting HR review. */
export function useAttendanceExceptions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.attendanceExceptions,
    queryFn: async () => {
      const { data } = await api.get<Envelope<AttendanceRecord[]>>('/attendance/exceptions');
      return data.data;
    },
    enabled,
  });
}

export function useAttendanceSummary(year: number, month: number, employeeId?: string) {
  return useQuery({
    queryKey: queryKeys.attendanceSummary(year, month, employeeId),
    queryFn: async () => {
      const { data } = await api.get<Envelope<AttendanceSummary>>('/attendance/summary', {
        params: cleanParams({ year, month, employeeId }),
      });
      return data.data;
    },
  });
}

export function useAttendanceAction() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  /**
   * The server returns its freshly derived state with every punch, so writing
   * it straight into the cache flips the card in one paint instead of waiting
   * for a refetch to come back.
   */
  const applyToday = (today: TodayAttendance) => {
    queryClient.setQueryData(queryKeys.attendanceToday, today);
    invalidate();
  };

  const checkIn = useMutation({
    // A mutation key lets React Query dedupe by key: a second click while the
    // first request is still in flight does not fire a second POST.
    mutationKey: ['attendance', 'check-in'],
    mutationFn: async (payload: {
      workLocation: WorkLocation;
      workLocationDetail?: string;
    }) => {
      const { data } = await api.post<Envelope<TodayAttendance>>(
        '/attendance/check-in',
        payload,
      );
      return data.data;
    },
    onSuccess(today) {
      applyToday(today);
      toast.success('Checked in', {
        description: today.record?.checkIn
          ? `Recorded at ${formatTime(today.record.checkIn)} IST. Have a good day.`
          : 'Have a good day.',
      });
    },
    onError: (error) => toastError(error, 'Could not check in'),
  });

  const checkOut = useMutation({
    mutationKey: ['attendance', 'check-out'],
    mutationFn: async () => {
      const { data } = await api.post<Envelope<TodayAttendance>>('/attendance/check-out');
      return data.data;
    },
    onSuccess(today) {
      applyToday(today);
      toast.success('Checked out', {
        description: `${formatDuration(today.record?.workedMinutes ?? 0)} logged today.`,
      });
    },
    onError: (error) => toastError(error, 'Could not check out'),
  });

  /** HR correction — the reason is mandatory and lands in the audit log. */
  const correct = useMutation({
    mutationFn: async (payload: {
      employeeId: string;
      date: string;
      status: AttendanceStatus;
      checkIn?: string;
      checkOut?: string;
      reason: string;
    }) => {
      const { data } = await api.post<Envelope<AttendanceRecord>>(
        '/attendance/correction',
        payload,
      );
      return data.data;
    },
    onSuccess() {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog });
      toast.success('Attendance corrected', { description: 'The change is in the audit log.' });
    },
    onError: (error) => toastError(error, 'Could not correct the record'),
  });

  return { checkIn, checkOut, correct };
}

/**
 * Work reports for the current open day. Every mutation returns the server's
 * fresh `today` payload, so the lock state and the list stay in step.
 */
export function useWorkReportActions() {
  const queryClient = useQueryClient();

  const applyToday = (today: TodayAttendance) => {
    queryClient.setQueryData(queryKeys.attendanceToday, today);
    void queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };

  const add = useMutation({
    mutationFn: async (payload: { details: string; status: WorkReportStatus }) => {
      const { data } = await api.post<Envelope<TodayAttendance>>(
        '/attendance/work-reports',
        payload,
      );
      return data.data;
    },
    onSuccess(today) {
      applyToday(today);
      toast.success('Work report added');
    },
    onError: (error) => toastError(error, 'Could not add the work report'),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      details?: string;
      status?: WorkReportStatus;
    }) => {
      const { data } = await api.patch<Envelope<TodayAttendance>>(
        `/attendance/work-reports/${id}`,
        payload,
      );
      return data.data;
    },
    onSuccess(today) {
      applyToday(today);
      toast.success('Work report updated');
    },
    onError: (error) => toastError(error, 'Could not update the work report'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Envelope<TodayAttendance>>(
        `/attendance/work-reports/${id}`,
      );
      return data.data;
    },
    onSuccess(today) {
      applyToday(today);
      toast.success('Work report removed');
    },
    onError: (error) => toastError(error, 'Could not remove the work report'),
  });

  return { add, update, remove };
}

// ----------------------------- Leave ---------------------------------------

export function useLeaveTypes() {
  return useQuery({
    queryKey: queryKeys.leaveTypes,
    queryFn: async () => {
      const { data } = await api.get<Envelope<LeaveType[]>>('/leave/types');
      return data.data;
    },
    staleTime: 10 * 60_000,
  });
}

export interface LeaveFilters {
  page: number;
  pageSize: number;
  status?: LeaveStatus | '';
  employeeId?: string;
  leaveTypeId?: string;
}

export function useLeaveRequests(filters: LeaveFilters) {
  return useQuery({
    queryKey: queryKeys.leaveRequests(filters),
    queryFn: async () => {
      const { data } = await api.get<Paginated<LeaveRequest>>('/leave/requests', {
        params: cleanParams(filters),
      });
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useLeaveBalances(employeeId?: string, year?: number) {
  const selfEmployeeId = useSelfEmployeeId();

  return useQuery({
    queryKey: queryKeys.leaveBalances(employeeId, year),
    queryFn: async () => {
      const { data } = await api.get<Envelope<LeaveBalanceRow[]>>('/leave/balances', {
        params: cleanParams({ employeeId, year }),
      });
      return data.data;
    },
    enabled: Boolean(employeeId ?? selfEmployeeId),
  });
}

export function useLeaveActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const create = useMutation({
    mutationFn: async (payload: {
      employeeId?: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason: string;
    }) => {
      const { data } = await api.post<Envelope<LeaveRequest>>('/leave/requests', payload);
      return data.data;
    },
    onSuccess(request) {
      invalidate();
      toast.success('Leave request submitted', {
        description: `${request.days} working day(s) · awaiting approval`,
      });
    },
    onError: (error) => toastError(error, 'Could not submit the request'),
  });

  const decide = useMutation({
    mutationFn: async ({
      id,
      decision,
      note,
    }: {
      id: string;
      decision: 'APPROVED' | 'REJECTED';
      note?: string;
    }) => {
      const { data } = await api.patch<Envelope<LeaveRequest>>(
        `/leave/requests/${id}/decision`,
        { decision, note },
      );
      return data.data;
    },
    onSuccess(request) {
      invalidate();
      toast.success(request.status === 'APPROVED' ? 'Leave approved' : 'Leave rejected');
    },
    onError: (error) => toastError(error, 'Could not record the decision'),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch<Envelope<LeaveRequest>>(`/leave/requests/${id}/cancel`);
      return data.data;
    },
    onSuccess() {
      invalidate();
      toast.success('Leave request cancelled');
    },
    onError: (error) => toastError(error, 'Could not cancel the request'),
  });

  return { create, decide, cancel };
}

// ----------------------------- Payroll -------------------------------------

export function usePayrollRuns() {
  return useQuery({
    queryKey: queryKeys.payrollRuns,
    queryFn: async () => {
      const { data } = await api.get<Envelope<PayrollRun[]>>('/payroll/runs');
      return data.data;
    },
  });
}

export function usePayrollRun(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.payrollRun(id ?? ''),
    queryFn: async () => {
      const { data } = await api.get<Envelope<PayrollRunDetail>>(`/payroll/runs/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function usePayslips(employeeId?: string) {
  const selfEmployeeId = useSelfEmployeeId();

  return useQuery({
    queryKey: queryKeys.payslips(employeeId),
    queryFn: async () => {
      const { data } = await api.get<Envelope<PayslipWithRun[]>>('/payroll/payslips', {
        params: cleanParams({ employeeId }),
      });
      return data.data;
    },
    enabled: Boolean(employeeId ?? selfEmployeeId),
  });
}

export function usePayrollActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.payrollRuns });
    void queryClient.invalidateQueries({ queryKey: ['payroll-run'] });
    void queryClient.invalidateQueries({ queryKey: ['payslips'] });
  };

  const generate = useMutation({
    mutationFn: async (payload: { month: number; year: number }) => {
      const { data } = await api.post<Envelope<PayrollRun>>('/payroll/runs', payload);
      return data.data;
    },
    onSuccess() {
      invalidate();
      toast.success('Draft payroll generated', {
        description: 'Review the payslips, then approve the run.',
      });
    },
    onError: (error) => toastError(error, 'Could not generate payroll'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'DRAFT' | 'APPROVED' | 'PAID' }) => {
      const { data } = await api.patch<Envelope<PayrollRun>>(`/payroll/runs/${id}/status`, {
        status,
      });
      return data.data;
    },
    onSuccess(run) {
      invalidate();
      toast.success(`Run marked ${run.status.toLowerCase()}`);
    },
    onError: (error) => toastError(error, 'Could not update the run'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/payroll/runs/${id}`);
    },
    onSuccess() {
      invalidate();
      toast.success('Draft run deleted');
    },
    onError: (error) => toastError(error, 'Could not delete the run'),
  });

  return { generate, setStatus, remove };
}

// ----------------------------- Channels ------------------------------------

export function useChannels() {
  return useQuery({
    queryKey: queryKeys.channels,
    queryFn: async () => {
      const { data } = await api.get<Envelope<ChannelOverview[]>>('/channels');
      return data.data;
    },
  });
}

export function useChannelActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    void queryClient.invalidateQueries({ queryKey: ['employee'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const assign = useMutation({
    mutationFn: async (payload: {
      employeeId: string;
      channel: SalesChannel;
      allocationPct: number;
      isPrimary: boolean;
      channelRole?: string;
    }) => {
      const { data } = await api.post('/channels/assignments', payload);
      return data;
    },
    onSuccess() {
      invalidate();
      toast.success('Channel assignment saved');
    },
    onError: (error) => toastError(error, 'Could not save the assignment'),
  });

  const unassign = useMutation({
    mutationFn: async ({
      employeeId,
      channel,
    }: {
      employeeId: string;
      channel: SalesChannel;
    }) => {
      await api.delete(`/channels/assignments/${employeeId}/${channel}`);
    },
    onSuccess() {
      invalidate();
      toast.success('Removed from channel');
    },
    onError: (error) => toastError(error, 'Could not remove the assignment'),
  });

  return { assign, unassign };
}

// ----------------------------- Users & admin -------------------------------

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: async () => {
      const { data } = await api.get<Envelope<AppUser[]>>('/users');
      return data.data;
    },
  });
}

export function useAuditLog() {
  return useQuery({
    queryKey: queryKeys.auditLog,
    queryFn: async () => {
      const { data } = await api.get<Envelope<AuditLogEntry[]>>('/users/audit-log');
      return data.data;
    },
  });
}

export function useUserActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog });
  };

  const create = useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      role: string;
      employeeId?: string;
    }) => {
      const { data } = await api.post<Envelope<AppUser>>('/users', payload);
      return data.data;
    },
    onSuccess() {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['employee'] });
      toast.success('Login created');
    },
    onError: (error) => toastError(error, 'Could not create the login'),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: { role?: string; isActive?: boolean; password?: string };
    }) => {
      const { data } = await api.patch<Envelope<AppUser>>(`/users/${id}`, payload);
      return data.data;
    },
    onSuccess(_, variables) {
      invalidate();
      toast.success(
        variables.payload.password ? 'Password reset — other sessions signed out' : 'User updated',
      );
    },
    onError: (error) => toastError(error, 'Could not update the user'),
  });

  return { create, update };
}

// ----------------------------- Misc ----------------------------------------

export function useHolidays(year?: number) {
  return useQuery({
    queryKey: queryKeys.holidays(year),
    queryFn: async () => {
      const { data } = await api.get<Envelope<Holiday[]>>('/holidays', {
        params: cleanParams({ year }),
      });
      return data.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: queryKeys.announcements,
    queryFn: async () => {
      const { data } = await api.get<Envelope<Announcement[]>>('/announcements');
      return data.data;
    },
  });
}

export function useAnnouncementActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const create = useMutation({
    mutationFn: async (payload: {
      title: string;
      body: string;
      channel?: SalesChannel;
      pinned: boolean;
    }) => {
      const { data } = await api.post<Envelope<Announcement>>('/announcements', payload);
      return data.data;
    },
    onSuccess() {
      invalidate();
      toast.success('Announcement posted');
    },
    onError: (error) => toastError(error, 'Could not post the announcement'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/announcements/${id}`);
    },
    onSuccess() {
      invalidate();
      toast.success('Announcement deleted');
    },
    onError: (error) => toastError(error, 'Could not delete the announcement'),
  });

  return { create, remove };
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => {
      await api.post('/auth/change-password', payload);
    },
    onError: (error) => toastError(error, 'Could not change the password'),
  });
}
