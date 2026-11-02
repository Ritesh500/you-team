import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useDeleteEmployee, useEmployee, usePayslips } from '@/hooks/use-api';
import { can, ROLE_LABELS, useAuthStore } from '@/store/auth';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatMonthYear,
  humanizeEnum,
} from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar, PersonCell } from '@/components/ui/Avatar';
import {
  Badge,
  ChannelChip,
  EmployeeStatusBadge,
  InactiveBadge,
  PayrollStatusBadge,
} from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { Meter } from '@/components/charts/StatTile';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { EmployeeFormModal } from './employees/EmployeeFormModal';

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-ink-muted" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-ink-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-ink">{value}</dd>
      </div>
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: employee, isLoading, isError, error, refetch } = useEmployee(id);
  const { data: payslips } = usePayslips(id);
  const remove = useDeleteEmployee();

  if (isLoading) return <LoadingBlock label="Loading profile…" />;

  if (isError || !employee) {
    return (
      <ErrorState
        title="Could not load this employee"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const name = `${employee.firstName} ${employee.lastName}`;
  const allocationTotal = employee.channelAssignments.reduce(
    (sum, assignment) => sum + assignment.allocationPct,
    0,
  );

  return (
    <>
      <PageHeader
        title={name}
        breadcrumb={
          <Link
            to="/employees"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All employees
          </Link>
        }
        description={`${employee.designation}${employee.department ? ` · ${employee.department.name}` : ''}`}
        actions={
          <>
            {can.manageEmployees(role) && (
              <Button
                variant="secondary"
                onClick={() => setEditOpen(true)}
                leadingIcon={<Pencil className="h-4 w-4" aria-hidden />}
              >
                Edit
              </Button>
            )}
            {can.deleteEmployees(role) && (
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                leadingIcon={<Trash2 className="h-4 w-4" aria-hidden />}
                className="text-critical hover:bg-rose-50 dark:hover:bg-rose-950"
              >
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ----- Identity card ----- */}
        <Card className="lg:col-span-1">
          <CardBody className="text-center">
            <Avatar name={name} src={employee.avatarUrl} size="xl" className="mx-auto" />
            <h2 className="mt-3 text-lg font-semibold text-ink">{name}</h2>
            <p className="text-sm text-ink-secondary">{employee.designation}</p>

            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <EmployeeStatusBadge status={employee.status} />
              <Badge tone="neutral">{humanizeEnum(employee.employmentType)}</Badge>
              <Badge tone="neutral">{employee.employeeCode}</Badge>
            </div>
          </CardBody>

          <div className="border-t border-hairline px-4 py-2 sm:px-5">
            <dl className="divide-y divide-hairline">
              <DetailRow
                icon={<Mail className="h-4 w-4" />}
                label="Work email"
                value={
                  <a href={`mailto:${employee.workEmail}`} className="hover:underline">
                    {employee.workEmail}
                  </a>
                }
              />
              {employee.phone && (
                <DetailRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Phone"
                  value={
                    <a href={`tel:${employee.phone}`} className="tabular hover:underline">
                      {employee.phone}
                    </a>
                  }
                />
              )}
              <DetailRow
                icon={<CalendarDays className="h-4 w-4" />}
                label="Joined"
                value={
                  <>
                    <span className="tabular">{formatDate(employee.joiningDate)}</span>
                    {employee.exitDate && (
                      <span className="tabular text-ink-muted">
                        {' '}
                        · exited {formatDate(employee.exitDate)}
                      </span>
                    )}
                  </>
                }
              />
              <DetailRow
                icon={<Building2 className="h-4 w-4" />}
                label="Department"
                value={employee.department?.name ?? 'Unassigned'}
              />
              {employee.manager && (
                <DetailRow
                  icon={<Briefcase className="h-4 w-4" />}
                  label="Reports to"
                  value={
                    <Link
                      to={`/employees/${employee.manager.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {employee.manager.firstName} {employee.manager.lastName}
                    </Link>
                  }
                />
              )}
              {(employee.city || employee.state) && (
                <DetailRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Location"
                  value={[employee.city, employee.state, employee.country]
                    .filter(Boolean)
                    .join(', ')}
                />
              )}
              {can.managePayroll(role) && (
                <DetailRow
                  icon={<Wallet className="h-4 w-4" />}
                  label="Annual CTC"
                  value={<span className="tabular">{formatCurrency(employee.ctcAnnual)}</span>}
                />
              )}
              {employee.user && (
                <DetailRow
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Console access"
                  value={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="info">{ROLE_LABELS[employee.user.role]}</Badge>
                      {!employee.user.isActive && <InactiveBadge />}
                      {employee.user.lastLoginAt && (
                        <span className="text-xs text-ink-muted">
                          last in {formatDate(employee.user.lastLoginAt)}
                        </span>
                      )}
                    </span>
                  }
                />
              )}
            </dl>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {/* ----- Channels ----- */}
          <Card>
            <CardHeader
              title="Sales channel allocation"
              description={
                employee.channelAssignments.length > 0
                  ? `${allocationTotal}% of their time is allocated`
                  : 'Not assigned to any marketplace yet'
              }
            />
            <CardBody>
              {employee.channelAssignments.length === 0 ? (
                <p className="text-sm text-ink-secondary">
                  This person is not assigned to a sales channel. Edit the record to add one.
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {employee.channelAssignments.map((assignment) => (
                    <li
                      key={assignment.channel}
                      className="rounded-lg border border-hairline bg-surface-sunken p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <ChannelChip channel={assignment.channel} />
                        {assignment.isPrimary && <Badge tone="info">Primary</Badge>}
                      </div>
                      <Meter
                        label={assignment.channelRole ?? 'Allocation'}
                        value={assignment.allocationPct}
                        max={100}
                        unit="%"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* ----- Leave balances ----- */}
          <Card>
            <CardHeader
              title="Leave balance"
              description={`Entitlement for ${new Date().getUTCFullYear()}`}
            />
            <CardBody>
              {employee.leaveBalances.length === 0 ? (
                <p className="text-sm text-ink-secondary">No leave balance recorded yet.</p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {employee.leaveBalances
                    .filter((balance) => balance.entitled > 0)
                    .map((balance) => {
                      const available = balance.entitled - balance.used;
                      return (
                        <li key={balance.leaveType.id}>
                          <Meter
                            label={`${balance.leaveType.name} — ${available} left`}
                            value={balance.used}
                            max={balance.entitled}
                            unit="d"
                            tone={
                              available <= 0
                                ? 'critical'
                                : available <= 2
                                  ? 'warning'
                                  : 'brand'
                            }
                          />
                        </li>
                      );
                    })}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* ----- Direct reports ----- */}
          {employee.reports.length > 0 && (
            <Card>
              <CardHeader
                title="Direct reports"
                description={`${employee.reports.length} ${employee.reports.length === 1 ? 'person' : 'people'}`}
              />
              <ul className="divide-y divide-hairline">
                {employee.reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      to={`/employees/${report.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken sm:px-5"
                    >
                      <PersonCell
                        name={`${report.firstName} ${report.lastName}`}
                        secondary={report.designation}
                        src={report.avatarUrl}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ----- Payslips ----- */}
          <Card>
            <CardHeader title="Payslips" description="Approved and paid runs only" />
            {!payslips || payslips.length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-6 w-6" aria-hidden />}
                title="No payslips yet"
                description="They will appear here once a payroll run is approved."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Period</Th>
                      <Th align="right">Gross</Th>
                      <Th align="right" className="hidden sm:table-cell">
                        Deductions
                      </Th>
                      <Th align="right">Net pay</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslips.map((payslip) => (
                      <Tr key={payslip.id}>
                        <Td className="font-medium">
                          {formatMonthYear(payslip.payrollRun.month, payslip.payrollRun.year)}
                        </Td>
                        <Td align="right" className="tabular">
                          {formatCompactCurrency(payslip.grossEarnings)}
                        </Td>
                        <Td align="right" className="tabular hidden sm:table-cell">
                          {formatCompactCurrency(payslip.totalDeductions)}
                        </Td>
                        <Td align="right" className="tabular font-semibold">
                          {formatCompactCurrency(payslip.netPay)}
                        </Td>
                        <Td>
                          <PayrollStatusBadge status={payslip.payrollRun.status} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>

      <EmployeeFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        employee={employee}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await remove.mutateAsync(employee.id);
          setConfirmDelete(false);
          navigate('/employees', { replace: true });
        }}
        title={`Delete ${name}?`}
        message={
          <>
            This removes the employee record, their login, attendance history, leave requests and
            payslips. <strong className="text-ink">This cannot be undone.</strong>
          </>
        }
        confirmLabel="Delete permanently"
        isLoading={remove.isPending}
        destructive
      />
    </>
  );
}
