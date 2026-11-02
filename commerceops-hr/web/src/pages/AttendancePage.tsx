import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CalendarCheck, Pencil, Plus } from 'lucide-react';
import {
  useAttendance,
  useAttendanceExceptions,
  useAttendanceSummary,
  useDepartments,
  type AttendanceFilters,
} from '@/hooks/use-api';
import { can, useAuthStore } from '@/store/auth';
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatTime,
  humanizeEnum,
} from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { PersonCell } from '@/components/ui/Avatar';
import { AttendanceStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { StatTile } from '@/components/charts/StatTile';
import { ChartFrame, ChartTooltip } from '@/components/charts/ChartFrame';
import { AXIS_PROPS, GRID_PROPS, MAX_BAR_SIZE, SERIES } from '@/components/charts/chart-theme';
import { AttendanceCard } from '@/components/attendance/AttendanceCard';
import { CorrectionModal } from '@/components/attendance/CorrectionModal';
import type { AttendanceRecord, AttendanceStatus, WorkLocation } from '@/types/api';

const WORK_LOCATION_LABELS: Record<WorkLocation, string> = {
  OFFICE: 'Office',
  HOME: 'Home',
  OTHER: 'Other',
};

const STATUSES: AttendanceStatus[] = [
  'PRESENT',
  'WORK_FROM_HOME',
  'HALF_DAY',
  'ABSENT',
  'ON_LEAVE',
  'HOLIDAY',
  'WEEK_OFF',
  'MISSING_CHECKOUT',
];

export function AttendancePage() {
  const role = useAuthStore((state) => state.user?.role);
  const now = new Date();

  const [period, setPeriod] = useState({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  });
  const [filters, setFilters] = useState<AttendanceFilters>({ page: 1, pageSize: 20 });
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);
  const [recordingNew, setRecordingNew] = useState(false);

  const isHr = can.markAttendance(role);
  const seesOthers = can.viewTeamData(role);

  const { data: departments } = useDepartments();
  const { data: summary } = useAttendanceSummary(period.year, period.month);
  const { data: exceptions } = useAttendanceExceptions(isHr);
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useAttendance(filters);

  const statusCount = (status: AttendanceStatus) =>
    summary?.byStatus.find((row) => row.status === status)?.count ?? 0;

  const seriesRows =
    summary?.series.map((point) => [
      formatDate(point.date),
      point.present,
      point.absent,
      point.onLeave,
    ]) ?? [];

  return (
    <>
      <PageHeader
        title="Attendance"
        description={
          seesOthers
            ? 'Your day, plus the records you are permitted to see.'
            : 'Your check-in history. Times are shown in IST.'
        }
        actions={
          isHr ? (
            <Button
              onClick={() => setRecordingNew(true)}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
            >
              Record attendance
            </Button>
          ) : undefined
        }
      />

      <AttendanceCard className="mb-5" />

      {/* HR: open missing check-outs needing review */}
      {isHr && exceptions && exceptions.length > 0 && (
        <Card className="mb-5 border-amber-300 dark:border-amber-800">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                Missing check-outs
              </span>
            }
            description={`${exceptions.length} day(s) were checked into but never closed. No checkout time is ever invented — correct them here.`}
          />
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Date</Th>
                  <Th>Checked in</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((record) => (
                  <Tr key={record.id}>
                    <Td>
                      <PersonCell
                        name={`${record.employee.firstName} ${record.employee.lastName}`}
                        secondary={record.employee.department?.name ?? record.employee.designation}
                        src={record.employee.avatarUrl}
                      />
                    </Td>
                    <Td className="tabular whitespace-nowrap">{formatDate(record.date)}</Td>
                    <Td className="tabular">{formatTime(record.checkIn)}</Td>
                    <Td align="right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCorrecting(record)}
                        leadingIcon={<Pencil className="h-3.5 w-3.5" aria-hidden />}
                      >
                        Correct
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {/* Month selector */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-hairline bg-surface p-3">
        <Select
          label="Month"
          value={period.month}
          onChange={(event) => setPeriod((p) => ({ ...p, month: Number(event.target.value) }))}
          containerClassName="w-40"
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
            <option key={month} value={month}>
              {new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(
                new Date(Date.UTC(2026, month - 1, 1)),
              )}
            </option>
          ))}
        </Select>

        <Select
          label="Year"
          value={period.year}
          onChange={(event) => setPeriod((p) => ({ ...p, year: Number(event.target.value) }))}
          containerClassName="w-28"
        >
          {[now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1].map(
            (year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ),
          )}
        </Select>
      </div>

      {/* Month KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label="Present" value={formatNumber(statusCount('PRESENT'))} />
        <StatTile label="Work from home" value={formatNumber(statusCount('WORK_FROM_HOME'))} />
        <StatTile label="Half days" value={formatNumber(statusCount('HALF_DAY'))} />
        <StatTile label="Absent" value={formatNumber(statusCount('ABSENT'))} />
        <StatTile
          label="Hours logged"
          value={formatNumber(Math.round(summary?.totalWorkedHours ?? 0))}
          sublabel="this month"
        />
      </div>

      {/* Daily chart — three series, so a legend is always present and the
          table view carries every value (relief for the light-mode aqua step). */}
      {summary && summary.series.length > 0 && (
        <ChartFrame
          title="Attendance by day"
          description="Stacked counts for the selected month"
          series={[
            { key: 'present', label: 'Present (incl. WFH, half-days)', color: SERIES.one },
            { key: 'absent', label: 'Absent', color: SERIES.two },
            { key: 'onLeave', label: 'On leave', color: SERIES.three },
          ]}
          tableColumns={['Date', 'Present', 'Absent', 'On leave']}
          tableRows={seriesRows}
          height="h-72"
          className="mb-5"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="date"
                {...AXIS_PROPS}
                tickFormatter={(value: string) => value.slice(8)}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis {...AXIS_PROPS} width={30} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgb(var(--surface-sunken))' }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      label={formatDate(String(label))}
                      rows={[
                        { label: 'Present', value: String(payload[0]?.value ?? 0), color: SERIES.one },
                        { label: 'Absent', value: String(payload[1]?.value ?? 0), color: SERIES.two },
                        { label: 'On leave', value: String(payload[2]?.value ?? 0), color: SERIES.three },
                      ]}
                    />
                  ) : null
                }
              />
              {/* 2px surface gap between stacked segments. */}
              <Bar
                dataKey="present"
                stackId="a"
                fill={SERIES.one}
                maxBarSize={MAX_BAR_SIZE}
                stroke="rgb(var(--surface))"
                strokeWidth={2}
              />
              <Bar
                dataKey="absent"
                stackId="a"
                fill={SERIES.two}
                maxBarSize={MAX_BAR_SIZE}
                stroke="rgb(var(--surface))"
                strokeWidth={2}
              />
              <Bar
                dataKey="onLeave"
                stackId="a"
                fill={SERIES.three}
                maxBarSize={MAX_BAR_SIZE}
                radius={[4, 4, 0, 0]}
                stroke="rgb(var(--surface))"
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}

      {/* History filters */}
      <div className="mb-4 grid gap-3 rounded-card border border-hairline bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="From"
          type="date"
          value={filters.from ?? ''}
          onChange={(event) =>
            setFilters((p) => ({ ...p, from: event.target.value || undefined, page: 1 }))
          }
        />
        <Input
          label="To"
          type="date"
          value={filters.to ?? ''}
          onChange={(event) =>
            setFilters((p) => ({ ...p, to: event.target.value || undefined, page: 1 }))
          }
        />
        <Select
          label="Status"
          value={filters.status ?? ''}
          onChange={(event) =>
            setFilters((p) => ({ ...p, status: event.target.value || undefined, page: 1 }))
          }
        >
          <option value="">Any status</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status === 'MISSING_CHECKOUT' ? 'Missing check-out' : humanizeEnum(status)}
            </option>
          ))}
        </Select>
        {seesOthers && (
          <Select
            label="Department"
            value={filters.departmentId ?? ''}
            onChange={(event) =>
              setFilters((p) => ({
                ...p,
                departmentId: event.target.value || undefined,
                page: 1,
              }))
            }
          >
            <option value="">All departments</option>
            {(departments ?? []).map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <Card className={isPlaceholderData ? 'opacity-60' : undefined}>
        <CardHeader
          title="Attendance history"
          description={
            seesOthers
              ? 'Scoped to the employees you are permitted to see.'
              : 'Only your own records.'
          }
        />

        {isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="h-6 w-6" aria-hidden />}
            title="No attendance records"
            description="Nothing matches the selected range and filters."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    {seesOthers && <Th>Employee</Th>}
                    <Th>Status</Th>
                    <Th className="hidden lg:table-cell">Location</Th>
                    <Th className="hidden sm:table-cell">Check in</Th>
                    <Th className="hidden sm:table-cell">Check out</Th>
                    <Th align="right">Hours</Th>
                    <Th align="right" className="hidden md:table-cell">
                      Tasks
                    </Th>
                    {isHr && <Th align="right">Action</Th>}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((record) => (
                    <Tr key={record.id}>
                      <Td className="tabular whitespace-nowrap font-medium">
                        {formatDate(record.date)}
                      </Td>
                      {seesOthers && (
                        <Td>
                          <PersonCell
                            name={`${record.employee.firstName} ${record.employee.lastName}`}
                            secondary={
                              record.employee.department?.name ?? record.employee.designation
                            }
                            src={record.employee.avatarUrl}
                          />
                        </Td>
                      )}
                      <Td>
                        <div className="flex flex-col gap-1">
                          <AttendanceStatusBadge status={record.status} />
                          {record.correctionReason && (
                            <span
                              className="text-[11px] italic text-ink-muted"
                              title={record.correctionReason}
                            >
                              corrected by HR
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td className="hidden text-xs text-ink-secondary lg:table-cell">
                        {record.workLocation
                          ? WORK_LOCATION_LABELS[record.workLocation] +
                            (record.workLocationDetail ? ` · ${record.workLocationDetail}` : '')
                          : '—'}
                      </Td>
                      <Td className="tabular hidden text-ink-secondary sm:table-cell">
                        {record.checkIn ? formatTime(record.checkIn) : '—'}
                      </Td>
                      <Td className="tabular hidden text-ink-secondary sm:table-cell">
                        {record.checkOut ? (
                          formatTime(record.checkOut)
                        ) : record.status === 'MISSING_CHECKOUT' ? (
                          <span className="text-amber-700 dark:text-amber-400">missing</span>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td align="right" className="tabular">
                        {record.workedMinutes > 0 ? formatDuration(record.workedMinutes) : '—'}
                      </Td>
                      <Td align="right" className="tabular hidden md:table-cell">
                        {record.workReports.length > 0 ? (
                          <span
                            title={record.workReports.map((r) => `• ${r.details}`).join('\n')}
                            className="cursor-help text-ink-secondary underline decoration-dotted"
                          >
                            {record.workReports.filter((r) => r.status === 'COMPLETED').length}/
                            {record.workReports.length}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </Td>
                      {isHr && (
                        <Td align="right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCorrecting(record)}
                            aria-label={`Correct attendance for ${record.employee.firstName} on ${formatDate(record.date)}`}
                            title="Correct this record"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            <Pagination
              meta={data.meta}
              itemLabel="records"
              onPageChange={(page) => setFilters((p) => ({ ...p, page }))}
              onPageSizeChange={(pageSize) => setFilters((p) => ({ ...p, pageSize, page: 1 }))}
            />
          </>
        )}
      </Card>

      <CorrectionModal
        open={Boolean(correcting) || recordingNew}
        onClose={() => {
          setCorrecting(null);
          setRecordingNew(false);
        }}
        record={correcting}
      />
    </>
  );
}
