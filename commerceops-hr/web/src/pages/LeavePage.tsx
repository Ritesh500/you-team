import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarOff, Check, CircleSlash, Plus, X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useEmployeeOptions,
  useLeaveActions,
  useLeaveBalances,
  useLeaveRequests,
  useLeaveTypes,
  type LeaveFilters,
} from '@/hooks/use-api';
import { can, useAuthStore } from '@/store/auth';
import { cn, formatDate, formatDateRange, humanizeEnum, todayInput } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { PersonCell } from '@/components/ui/Avatar';
import { Badge, LeaveStatusBadge } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { Meter } from '@/components/charts/StatTile';
import type { LeaveRequest, LeaveStatus } from '@/types/api';

const STATUS_TABS: { value: LeaveStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function ApplyLeaveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const role = useAuthStore((state) => state.user?.role);
  const isHr = can.manageEmployees(role);

  const { data: leaveTypes } = useLeaveTypes();
  const { data: employeeOptions } = useEmployeeOptions();
  const { create } = useLeaveActions();

  const [form, setForm] = useState({
    employeeId: '',
    leaveTypeId: '',
    startDate: todayInput(),
    endDate: todayInput(),
    reason: '',
  });
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      employeeId: '',
      leaveTypeId: leaveTypes?.[0]?.id ?? '',
      startDate: todayInput(),
      endDate: todayInput(),
      reason: '',
    });
    setApiError(null);
  }, [open, leaveTypes]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    try {
      await create.mutateAsync({
        ...(isHr && form.employeeId ? { employeeId: form.employeeId } : {}),
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
      });
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply for leave"
      description="Weekends and company holidays in the range are not counted."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="leave-form" isLoading={create.isPending}>
            Submit request
          </Button>
        </>
      }
    >
      <form id="leave-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        {isHr && (
          <Select
            label="Employee"
            value={form.employeeId}
            onChange={(event) => setForm((p) => ({ ...p, employeeId: event.target.value }))}
            hint="Leave blank to apply for yourself"
          >
            <option value="">Myself</option>
            {(employeeOptions ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.firstName} {option.lastName} — {option.designation}
              </option>
            ))}
          </Select>
        )}

        <Select
          label="Leave type"
          value={form.leaveTypeId}
          onChange={(event) => setForm((p) => ({ ...p, leaveTypeId: event.target.value }))}
          error={apiError?.fieldError('leaveTypeId')}
          required
        >
          {(leaveTypes ?? []).map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} ({type.code}){type.isPaid ? '' : ' — unpaid'}
            </option>
          ))}
        </Select>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="From"
            type="date"
            value={form.startDate}
            onChange={(event) => {
              const startDate = event.target.value;
              setForm((p) => ({
                ...p,
                startDate,
                // Keep the range valid as the user picks dates.
                endDate: p.endDate < startDate ? startDate : p.endDate,
              }));
            }}
            error={apiError?.fieldError('startDate')}
            required
          />
          <Input
            label="To"
            type="date"
            min={form.startDate}
            value={form.endDate}
            onChange={(event) => setForm((p) => ({ ...p, endDate: event.target.value }))}
            error={apiError?.fieldError('endDate')}
            required
          />
        </div>

        <Textarea
          label="Reason"
          value={form.reason}
          onChange={(event) => setForm((p) => ({ ...p, reason: event.target.value }))}
          error={apiError?.fieldError('reason')}
          placeholder="Family wedding in Kochi"
          hint="At least 5 characters"
          rows={3}
          required
        />
      </form>
    </Modal>
  );
}

function DecisionModal({
  request,
  decision,
  onClose,
}: {
  request: LeaveRequest | null;
  decision: 'APPROVED' | 'REJECTED';
  onClose: () => void;
}) {
  const { decide } = useLeaveActions();
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote('');
  }, [request]);

  if (!request) return null;

  const isApproval = decision === 'APPROVED';

  return (
    <Modal
      open
      onClose={onClose}
      title={isApproval ? 'Approve this leave?' : 'Reject this leave?'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button
            variant={isApproval ? 'primary' : 'danger'}
            isLoading={decide.isPending}
            onClick={async () => {
              await decide.mutateAsync({
                id: request.id,
                decision,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
              onClose();
            }}
          >
            {isApproval ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-sunken p-3">
          <PersonCell
            name={`${request.employee.firstName} ${request.employee.lastName}`}
            secondary={request.employee.designation}
            src={request.employee.avatarUrl}
          />
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Type</dt>
              <dd className="font-medium text-ink">{request.leaveType.name}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Dates</dt>
              <dd className="tabular font-medium text-ink">
                {formatDate(request.startDate)} → {formatDate(request.endDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Working days</dt>
              <dd className="tabular font-medium text-ink">{request.days}</dd>
            </div>
            <div className="mt-2">
              <dt className="text-ink-muted">Reason</dt>
              <dd className="mt-0.5 text-ink">{request.reason}</dd>
            </div>
          </dl>
        </div>

        {isApproval && (
          <p className="text-xs text-ink-secondary">
            Approving debits {request.days} day(s) from their {request.leaveType.name} balance and
            marks those days as on-leave in attendance.
          </p>
        )}

        <Textarea
          label="Note for the employee"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            isApproval ? 'Approved — cover arranged.' : 'Peak sale week, please re-plan.'
          }
          rows={2}
        />
      </div>
    </Modal>
  );
}

export function LeavePage() {
  const user = useAuthStore((state) => state.user);
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState<LeaveFilters>(() => ({
    page: 1,
    pageSize: 20,
    status: (searchParams.get('status') as LeaveStatus | null) ?? '',
  }));

  const [applyOpen, setApplyOpen] = useState(false);
  const [deciding, setDeciding] = useState<{
    request: LeaveRequest;
    decision: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);

  const { data: balances } = useLeaveBalances();
  const { data, isLoading, isError, error, refetch, isPlaceholderData } =
    useLeaveRequests(filters);
  const { cancel } = useLeaveActions();

  const canApprove = can.approveLeave(user?.role);

  return (
    <>
      <PageHeader
        title="Leave"
        description="Requests, approvals and balances."
        actions={
          <Button
            onClick={() => setApplyOpen(true)}
            leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
          >
            Apply for leave
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {/* ----- Balances ----- */}
        <Card className="lg:col-span-1">
          <CardHeader
            title="Your balance"
            description={`Entitlement for ${new Date().getUTCFullYear()}`}
          />
          <CardBody>
            {/* The "not linked" case must be checked first: with no employee
                record the balances query never runs, so `!balances` would
                otherwise leave this stuck on "Loading…" forever. */}
            {!user?.employeeId ? (
              <p className="text-sm text-ink-secondary">
                Your login is not linked to an employee record, so there is no balance to show.
                Leave balances belong to people on the roster.
              </p>
            ) : !balances ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : (
              <ul className="space-y-4">
                {balances
                  .filter((balance) => balance.entitled > 0)
                  .map((balance) => (
                    <li key={balance.leaveType.id}>
                      <Meter
                        label={`${balance.leaveType.name} — ${balance.available ?? balance.entitled - balance.used} left`}
                        value={balance.used}
                        max={balance.entitled}
                        unit="d"
                        tone={
                          (balance.available ?? 0) <= 0
                            ? 'critical'
                            : (balance.available ?? 0) <= 2
                              ? 'warning'
                              : 'brand'
                        }
                      />
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* ----- Requests ----- */}
        <div className="lg:col-span-3">
          {/* Status tabs */}
          <div className="mb-4 flex flex-wrap gap-1 rounded-card border border-hairline bg-surface p-1.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => setFilters((p) => ({ ...p, status: tab.value, page: 1 }))}
                aria-current={filters.status === tab.value ? 'true' : undefined}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  filters.status === tab.value
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Card className={isPlaceholderData ? 'opacity-60' : undefined}>
            {isLoading ? (
              <TableSkeleton rows={6} columns={5} />
            ) : isError ? (
              <ErrorState
                message={error instanceof Error ? error.message : undefined}
                onRetry={() => void refetch()}
              />
            ) : !data || data.data.length === 0 ? (
              <EmptyState
                icon={<CalendarOff className="h-6 w-6" aria-hidden />}
                title="No leave requests"
                description={
                  filters.status
                    ? `Nothing with status "${humanizeEnum(filters.status)}".`
                    : 'Requests will show up here once submitted.'
                }
              />
            ) : (
              <>
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        {canApprove && <Th>Employee</Th>}
                        <Th>Type</Th>
                        <Th>Dates</Th>
                        <Th align="right">Days</Th>
                        <Th className="hidden lg:table-cell">Reason</Th>
                        <Th>Status</Th>
                        <Th align="right">Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((request) => {
                        const isOwn = request.employeeId === user?.employeeId;
                        const canCancel =
                          (isOwn || canApprove) &&
                          (request.status === 'PENDING' || request.status === 'APPROVED');

                        return (
                          <Tr key={request.id}>
                            {canApprove && (
                              <Td>
                                <PersonCell
                                  name={`${request.employee.firstName} ${request.employee.lastName}`}
                                  secondary={request.employee.department?.name ?? undefined}
                                  src={request.employee.avatarUrl}
                                />
                              </Td>
                            )}
                            <Td>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: request.leaveType.colorHex }}
                                  aria-hidden
                                />
                                <span className="whitespace-nowrap text-ink">
                                  {request.leaveType.name}
                                </span>
                                {!request.leaveType.isPaid && <Badge tone="warning">Unpaid</Badge>}
                              </span>
                            </Td>
                            <Td className="tabular whitespace-nowrap text-ink-secondary">
                              {formatDateRange(request.startDate, request.endDate)}
                            </Td>
                            <Td align="right" className="tabular font-medium">
                              {request.days}
                            </Td>
                            {/* Floor and ceiling: unconstrained this column
                                collapses to one word per line, but too wide
                                pushes the approve buttons off-screen. */}
                            <Td className="hidden min-w-[9rem] max-w-[12rem] lg:table-cell">
                              <span className="line-clamp-2 text-xs text-ink-secondary">
                                {request.reason}
                              </span>
                              {request.decisionNote && (
                                // No `block` here — it fights line-clamp's own
                                // `display: -webkit-box` and the clamp loses.
                                <span className="mt-0.5 line-clamp-1 text-xs italic text-ink-muted">
                                  “{request.decisionNote}”
                                </span>
                              )}
                            </Td>
                            <Td>
                              <LeaveStatusBadge status={request.status} />
                            </Td>
                            <Td align="right">
                              <div className="flex items-center justify-end gap-1">
                                {canApprove && request.status === 'PENDING' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setDeciding({ request, decision: 'APPROVED' })
                                      }
                                      aria-label="Approve"
                                      title="Approve"
                                      className="text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                                    >
                                      <Check className="h-4 w-4" aria-hidden />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setDeciding({ request, decision: 'REJECTED' })
                                      }
                                      aria-label="Reject"
                                      title="Reject"
                                      className="text-critical hover:bg-rose-50 dark:hover:bg-rose-950"
                                    >
                                      <X className="h-4 w-4" aria-hidden />
                                    </Button>
                                  </>
                                )}
                                {canCancel && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setCancelling(request)}
                                    aria-label="Cancel this request"
                                    title="Cancel this request"
                                  >
                                    <CircleSlash className="h-4 w-4" aria-hidden />
                                  </Button>
                                )}
                              </div>
                            </Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableWrap>

                <Pagination
                  meta={data.meta}
                  itemLabel="requests"
                  onPageChange={(page) => setFilters((p) => ({ ...p, page }))}
                  onPageSizeChange={(pageSize) =>
                    setFilters((p) => ({ ...p, pageSize, page: 1 }))
                  }
                />
              </>
            )}
          </Card>
        </div>
      </div>

      <ApplyLeaveModal open={applyOpen} onClose={() => setApplyOpen(false)} />

      {deciding && (
        <DecisionModal
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await cancel.mutateAsync(cancelling.id);
          setCancelling(null);
        }}
        title="Cancel this leave request?"
        message={
          cancelling?.status === 'APPROVED'
            ? `The ${cancelling.days} day(s) will be credited back and the on-leave attendance records removed.`
            : 'The request will be withdrawn.'
        }
        confirmLabel="Cancel request"
        isLoading={cancel.isPending}
        destructive
      />
    </>
  );
}
