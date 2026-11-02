import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Search } from 'lucide-react';
import { usePayrollActions, usePayrollRun } from '@/hooks/use-api';
import { formatCompactCurrency, formatCurrency, formatDate, formatMonthYear } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { PersonCell } from '@/components/ui/Avatar';
import { Badge, PayrollStatusBadge } from '@/components/ui/Badge';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { StatTile } from '@/components/charts/StatTile';

/** Exports the run as CSV, built client-side from data already loaded. */
function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const escape = (cell: string | number) => {
    const text = String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function PayrollRunPage() {
  const { id } = useParams<{ id: string }>();
  const { data: run, isLoading, isError, error, refetch } = usePayrollRun(id);
  const { setStatus } = usePayrollActions();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!run) return [];
    const query = search.trim().toLowerCase();
    if (!query) return run.payslips;
    return run.payslips.filter((payslip) =>
      `${payslip.employee.firstName} ${payslip.employee.lastName} ${payslip.employee.employeeCode}`
        .toLowerCase()
        .includes(query),
    );
  }, [run, search]);

  if (isLoading) return <LoadingBlock label="Loading payroll run…" />;

  if (isError || !run) {
    return (
      <ErrorState
        title="Could not load this run"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const period = formatMonthYear(run.month, run.year);

  const onExport = () => {
    downloadCsv(`payroll-${run.year}-${String(run.month).padStart(2, '0')}.csv`, [
      [
        'Employee code',
        'Name',
        'Designation',
        'Department',
        'Payable days',
        'LOP days',
        'Basic',
        'HRA',
        'Special allowance',
        'Bonus',
        'Gross earnings',
        'Provident fund',
        'Professional tax',
        'TDS',
        'Total deductions',
        'Net pay',
      ],
      ...run.payslips.map((payslip) => [
        payslip.employee.employeeCode,
        `${payslip.employee.firstName} ${payslip.employee.lastName}`,
        payslip.employee.designation,
        payslip.employee.department?.name ?? '',
        payslip.payableDays,
        payslip.lopDays,
        payslip.basic,
        payslip.hra,
        payslip.specialAllowance,
        payslip.bonus,
        payslip.grossEarnings,
        payslip.providentFund,
        payslip.professionalTax,
        payslip.tds,
        payslip.totalDeductions,
        payslip.netPay,
      ]),
    ]);
  };

  return (
    <>
      <PageHeader
        title={`Payroll — ${period}`}
        breadcrumb={
          <Link
            to="/payroll"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All payroll runs
          </Link>
        }
        description={`${run.payslips.length} payslips${run.paidAt ? ` · disbursed ${formatDate(run.paidAt)}` : ''}`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={onExport}
              leadingIcon={<Download className="h-4 w-4" aria-hidden />}
            >
              Export CSV
            </Button>
            {run.status === 'DRAFT' && (
              <Button
                onClick={() => setStatus.mutate({ id: run.id, status: 'APPROVED' })}
                isLoading={setStatus.isPending}
              >
                Approve run
              </Button>
            )}
            {run.status === 'APPROVED' && (
              <Button
                onClick={() => setStatus.mutate({ id: run.id, status: 'PAID' })}
                isLoading={setStatus.isPending}
              >
                Mark as paid
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Gross earnings" value={formatCompactCurrency(run.totals.gross)} />
        <StatTile label="Total deductions" value={formatCompactCurrency(run.totals.deductions)} />
        <StatTile
          label="Net payable"
          value={formatCompactCurrency(run.totals.net)}
          tone="attention"
        />
        <div className="card flex flex-col justify-between p-4">
          <p className="text-xs font-medium text-ink-secondary">Status</p>
          <div className="mt-2">
            <PayrollStatusBadge status={run.status} />
            {run.status === 'DRAFT' && (
              <p className="mt-1.5 text-xs text-ink-muted">Not yet approved for disbursement.</p>
            )}
          </div>
        </div>
      </div>

      {run.notes && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-xs text-ink-muted">Note</p>
          <p className="mt-0.5 text-sm text-ink">{run.notes}</p>
        </Card>
      )}

      <div className="mb-4">
        <Input
          placeholder="Search this run by name or code…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          leadingIcon={<Search className="h-4 w-4" aria-hidden />}
          aria-label="Search payslips"
          containerClassName="max-w-sm"
        />
      </div>

      <Card>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th align="right" className="hidden lg:table-cell">
                  Days
                </Th>
                <Th align="right" className="hidden xl:table-cell">
                  Basic
                </Th>
                <Th align="right" className="hidden xl:table-cell">
                  HRA
                </Th>
                <Th align="right" className="hidden md:table-cell">
                  Gross
                </Th>
                <Th align="right" className="hidden sm:table-cell">
                  Deductions
                </Th>
                <Th align="right">Net pay</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((payslip) => (
                <Tr key={payslip.id}>
                  <Td>
                    <PersonCell
                      name={`${payslip.employee.firstName} ${payslip.employee.lastName}`}
                      secondary={`${payslip.employee.employeeCode} · ${payslip.employee.designation}`}
                      src={payslip.employee.avatarUrl}
                    />
                  </Td>
                  <Td align="right" className="tabular hidden lg:table-cell">
                    {payslip.payableDays}
                    {payslip.lopDays > 0 && (
                      <Badge tone="warning" className="ml-1.5">
                        {payslip.lopDays} LOP
                      </Badge>
                    )}
                  </Td>
                  <Td align="right" className="tabular hidden text-ink-secondary xl:table-cell">
                    {formatCompactCurrency(payslip.basic)}
                  </Td>
                  <Td align="right" className="tabular hidden text-ink-secondary xl:table-cell">
                    {formatCompactCurrency(payslip.hra)}
                  </Td>
                  <Td align="right" className="tabular hidden md:table-cell">
                    {formatCompactCurrency(payslip.grossEarnings)}
                  </Td>
                  <Td align="right" className="tabular hidden text-ink-secondary sm:table-cell">
                    −{formatCompactCurrency(payslip.totalDeductions)}
                  </Td>
                  <Td align="right" className="tabular font-semibold">
                    {formatCurrency(payslip.netPay)}
                  </Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-sunken font-semibold">
                <Td>Total ({filtered.length} payslips)</Td>
                <Td className="hidden lg:table-cell" />
                <Td className="hidden xl:table-cell" />
                <Td className="hidden xl:table-cell" />
                <Td align="right" className="tabular hidden md:table-cell">
                  {formatCompactCurrency(
                    filtered.reduce((sum, payslip) => sum + payslip.grossEarnings, 0),
                  )}
                </Td>
                <Td align="right" className="tabular hidden sm:table-cell">
                  −
                  {formatCompactCurrency(
                    filtered.reduce((sum, payslip) => sum + payslip.totalDeductions, 0),
                  )}
                </Td>
                <Td align="right" className="tabular">
                  {formatCurrency(filtered.reduce((sum, payslip) => sum + payslip.netPay, 0))}
                </Td>
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}
