import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Play, Trash2, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { usePayrollActions, usePayrollRuns } from '@/hooks/use-api';
import { formatCompactCurrency, formatCurrency, formatDate, formatMonthYear, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { PayrollStatusBadge } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { StatTile } from '@/components/charts/StatTile';
import type { PayrollRun } from '@/types/api';

function GenerateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { generate } = usePayrollActions();
  const navigate = useNavigate();
  const now = new Date();

  // Default to last month — the one you would normally be running.
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const [month, setMonth] = useState(previous.getUTCMonth() + 1);
  const [year, setYear] = useState(previous.getUTCFullYear());
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    try {
      const run = await generate.mutateAsync({ month, year });
      onClose();
      navigate(`/payroll/${run.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate a payroll run"
      description="Builds a draft from every payable employee's CTC, deducting loss of pay from recorded absences."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="generate-form" isLoading={generate.isPending}>
            Generate draft
          </Button>
        </>
      }
    >
      <form id="generate-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Month"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(2026, value - 1, 1)),
                )}
              </option>
            ))}
          </Select>

          <Select
            label="Year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {[
              now.getUTCFullYear() - 1,
              now.getUTCFullYear(),
              now.getUTCFullYear() + 1,
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-lg bg-surface-sunken p-3 text-xs leading-relaxed text-ink-secondary">
          <p className="mb-1 font-semibold text-ink">How the draft is built</p>
          Basic is 50% of monthly gross, HRA is 40% of basic, and the rest is special allowance.
          PF is 12% of basic capped at the ₹15,000 wage ceiling, professional tax is a flat ₹200,
          and TDS is estimated at 5% of gross above a ₹5L annual CTC. Review every payslip before
          approving.
        </div>
      </form>
    </Modal>
  );
}

export function PayrollPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = usePayrollRuns();
  const { setStatus, remove } = usePayrollActions();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [deleting, setDeleting] = useState<PayrollRun | null>(null);

  if (isLoading) return <LoadingBlock label="Loading payroll runs…" />;

  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const latest = data[0];
  const paidTotal = data
    .filter((run) => run.status === 'PAID')
    .reduce((sum, run) => sum + run.totalNetPay, 0);

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Monthly runs, from draft through approval to disbursement."
        actions={
          <Button
            onClick={() => setGenerateOpen(true)}
            leadingIcon={<Play className="h-4 w-4" aria-hidden />}
          >
            Generate run
          </Button>
        }
      />

      {data.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile
            label="Latest run"
            value={latest ? formatMonthYear(latest.month, latest.year) : '—'}
            sublabel={latest ? `${latest.employeeCount} payslips` : undefined}
          />
          <StatTile
            label="Latest net pay"
            value={formatCompactCurrency(latest?.totalNetPay ?? 0)}
            sublabel={latest?.status.toLowerCase()}
          />
          <StatTile
            label="Total disbursed"
            value={formatCompactCurrency(paidTotal)}
            sublabel="across all paid runs"
          />
          <StatTile label="Runs on record" value={formatNumber(data.length)} />
        </div>
      )}

      <Card>
        {data.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-6 w-6" aria-hidden />}
            title="No payroll runs yet"
            description="Generate a draft for a month to get started."
            action={
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                Generate run
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Period</Th>
                  <Th align="right">Employees</Th>
                  <Th align="right" className="hidden sm:table-cell">
                    Gross
                  </Th>
                  <Th align="right" className="hidden md:table-cell">
                    Deductions
                  </Th>
                  <Th align="right">Net pay</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((run) => (
                  <Tr key={run.id}>
                    <Td>
                      <Link
                        to={`/payroll/${run.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {formatMonthYear(run.month, run.year)}
                      </Link>
                      {run.paidAt && (
                        <p className="tabular text-xs text-ink-muted">
                          paid {formatDate(run.paidAt)}
                        </p>
                      )}
                    </Td>
                    <Td align="right" className="tabular">
                      {run.employeeCount}
                    </Td>
                    <Td align="right" className="tabular hidden sm:table-cell">
                      {formatCompactCurrency(run.totalGross)}
                    </Td>
                    <Td align="right" className="tabular hidden md:table-cell">
                      {formatCompactCurrency(run.totalDeductions)}
                    </Td>
                    <Td align="right" className="tabular font-semibold">
                      {formatCurrency(run.totalNetPay)}
                    </Td>
                    <Td>
                      <PayrollStatusBadge status={run.status} />
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        {run.status === 'DRAFT' && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setStatus.mutate({ id: run.id, status: 'APPROVED' })
                              }
                              isLoading={setStatus.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleting(run)}
                              aria-label={`Delete the ${formatMonthYear(run.month, run.year)} draft`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-critical" aria-hidden />
                            </Button>
                          </>
                        )}
                        {run.status === 'APPROVED' && (
                          <Button
                            size="sm"
                            onClick={() => setStatus.mutate({ id: run.id, status: 'PAID' })}
                            isLoading={setStatus.isPending}
                          >
                            Mark paid
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/payroll/${run.id}`)}
                          aria-label={`Open the ${formatMonthYear(run.month, run.year)} run`}
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <GenerateModal open={generateOpen} onClose={() => setGenerateOpen(false)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          setDeleting(null);
        }}
        title="Delete this draft run?"
        message={
          deleting ? (
            <>
              The draft for{' '}
              <strong className="text-ink">
                {formatMonthYear(deleting.month, deleting.year)}
              </strong>{' '}
              and its {deleting.employeeCount} payslips will be removed. You can regenerate it
              afterwards.
            </>
          ) : null
        }
        confirmLabel="Delete draft"
        isLoading={remove.isPending}
        destructive
      />
    </>
  );
}
