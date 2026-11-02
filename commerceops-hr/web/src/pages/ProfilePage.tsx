import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useChangePassword, useEmployee, useLeaveBalances, usePayslips } from '@/hooks/use-api';
import { ROLE_LABELS, useAuthStore } from '@/store/auth';
import { useTheme } from '@/hooks/use-theme';
import { cn, formatCompactCurrency, formatDate, formatMonthYear } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, ChannelChip, EmployeeStatusBadge, PayrollStatusBadge } from '@/components/ui/Badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/States';
import { Meter } from '@/components/charts/StatTile';

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    setLocalError(null);

    if (form.newPassword !== form.confirm) {
      setLocalError('The two new passwords do not match.');
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      toast.success('Password changed', {
        description: 'All sessions were signed out. Please sign in again.',
      });

      // The server revoked every refresh token, so the session is over.
      await logout();
      navigate('/login', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Change password"
        description="Changing it signs you out of every device."
      />
      <CardBody>
        <form onSubmit={onSubmit} className="max-w-sm space-y-4" noValidate>
          {(apiError && !apiError.fieldErrors.length) || localError ? (
            <div
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
            >
              {localError ?? apiError?.message}
            </div>
          ) : null}

          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(event) => setForm((p) => ({ ...p, currentPassword: event.target.value }))}
            error={apiError?.fieldError('currentPassword')}
            required
          />

          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(event) => setForm((p) => ({ ...p, newPassword: event.target.value }))}
            error={apiError?.fieldError('newPassword')}
            hint="At least 8 characters, with a letter and a number"
            required
          />

          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(event) => setForm((p) => ({ ...p, confirm: event.target.value }))}
            required
          />

          <Button type="submit" isLoading={changePassword.isPending}>
            Change password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
  ];

  return (
    <Card>
      <CardHeader title="Appearance" description="Applies to this browser only." />
      <CardBody>
        <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                theme === option.value
                  ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                  : 'border-hairline text-ink-secondary hover:bg-surface-sunken',
              )}
            >
              <option.icon className="h-4 w-4" aria-hidden />
              {option.label}
              {theme === option.value && <Check className="h-3.5 w-3.5" aria-hidden />}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
          <Monitor className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Until you pick one, the app follows your operating system setting.
        </p>
      </CardBody>
    </Card>
  );
}

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const { data: employee } = useEmployee(user?.employeeId ?? undefined);
  const { data: balances } = useLeaveBalances();
  const { data: payslips } = usePayslips();

  if (!user) return null;

  return (
    <>
      <PageHeader title="My profile" description="Your record, balances and account settings." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardBody className="text-center">
              <Avatar name={user.fullName} src={user.avatarUrl} size="xl" className="mx-auto" />
              <h2 className="mt-3 text-lg font-semibold text-ink">{user.fullName}</h2>
              <p className="text-sm text-ink-secondary">{user.email}</p>

              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <Badge tone="info">{ROLE_LABELS[user.role]}</Badge>
                {employee && <EmployeeStatusBadge status={employee.status} />}
              </div>

              {employee && (
                <dl className="mt-5 space-y-2.5 border-t border-hairline pt-4 text-left text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">Employee code</dt>
                    <dd className="tabular font-medium text-ink">{employee.employeeCode}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">Designation</dt>
                    <dd className="text-right font-medium text-ink">{employee.designation}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">Department</dt>
                    <dd className="text-right font-medium text-ink">
                      {employee.department?.name ?? '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">Joined</dt>
                    <dd className="tabular font-medium text-ink">
                      {formatDate(employee.joiningDate)}
                    </dd>
                  </div>
                  {employee.manager && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Reports to</dt>
                      <dd className="text-right">
                        <Link
                          to={`/employees/${employee.manager.id}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {employee.manager.firstName} {employee.manager.lastName}
                        </Link>
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {employee && employee.channelAssignments.length > 0 && (
                <div className="mt-4 border-t border-hairline pt-4">
                  <p className="mb-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Your channels
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {employee.channelAssignments.map((assignment) => (
                      <ChannelChip
                        key={assignment.channel}
                        channel={assignment.channel}
                        suffix={`${assignment.allocationPct}%`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <AppearanceCard />
        </div>

        <div className="space-y-4 lg:col-span-2">
          {user.employeeId && (
            <Card>
              <CardHeader
                title="Leave balance"
                description={`Entitlement for ${new Date().getUTCFullYear()}`}
              />
              <CardBody>
                {!balances || balances.length === 0 ? (
                  <p className="text-sm text-ink-secondary">No balance recorded yet.</p>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {balances
                      .filter((balance) => balance.entitled > 0)
                      .map((balance) => (
                        <li key={balance.leaveType.id}>
                          <Meter
                            label={`${balance.leaveType.name} — ${balance.available ?? 0} left`}
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
          )}

          {user.employeeId && (
            <Card>
              <CardHeader title="My payslips" description="Approved and paid runs" />
              {!payslips || payslips.length === 0 ? (
                <EmptyState
                  title="No payslips yet"
                  description="They appear once a payroll run is approved."
                />
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Period</Th>
                        <Th align="right" className="hidden sm:table-cell">
                          Gross
                        </Th>
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
                          <Td align="right" className="tabular hidden sm:table-cell">
                            {formatCompactCurrency(payslip.grossEarnings)}
                          </Td>
                          <Td align="right" className="tabular hidden text-ink-secondary sm:table-cell">
                            −{formatCompactCurrency(payslip.totalDeductions)}
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
          )}

          <ChangePasswordCard />
        </div>
      </div>
    </>
  );
}
