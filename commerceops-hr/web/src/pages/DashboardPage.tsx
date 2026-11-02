import { Link, useNavigate } from 'react-router-dom';
import {
  Cake,
  CalendarClock,
  CalendarOff,
  PartyPopper,
  Pin,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useDashboard } from '@/hooks/use-api';
import { AttendanceCard } from '@/components/attendance/AttendanceCard';
import { can, useAuthStore } from '@/store/auth';
import {
  cn,
  formatCompactCurrency,
  formatDate,
  formatNumber,
  formatRelative,
} from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, ChannelChip } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { StatTile } from '@/components/charts/StatTile';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useDashboard();

  if (isLoading) return <LoadingBlock label="Building your dashboard…" />;

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load the dashboard"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const { kpis } = data;
  const firstName = user?.fullName.split(' ')[0] ?? 'there';

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description="Headcount, attendance and approvals across Shopify, Amazon, Flipkart and Myntra."
        actions={
          can.manageEmployees(user?.role) ? (
            <Button
              leadingIcon={<UserPlus className="h-4 w-4" aria-hidden />}
              onClick={() => navigate('/employees?new=1')}
            >
              Add employee
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-5">
        <AttendanceCard />

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile
            label="Active headcount"
            value={formatNumber(kpis.activeEmployees)}
            sublabel={`${kpis.totalEmployees} on record`}
            delta={
              kpis.joinedThisMonth > 0
                ? { value: kpis.joinedThisMonth, period: 'this month' }
                : undefined
            }
            icon={<Users className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            label="Present today"
            value={formatNumber(kpis.presentToday)}
            sublabel={`${kpis.attendanceRate}% of active staff`}
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            label="Pending approvals"
            value={formatNumber(kpis.pendingLeaveApprovals)}
            sublabel={kpis.pendingLeaveApprovals > 0 ? 'Waiting on a decision' : 'All clear'}
            tone={kpis.pendingLeaveApprovals > 0 ? 'attention' : 'default'}
            icon={<CalendarOff className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            label="Annual payroll cost"
            value={formatCompactCurrency(kpis.annualPayrollCost)}
            sublabel={`avg ${formatCompactCurrency(kpis.averageCtc)} CTC`}
            icon={<Wallet className="h-4 w-4" aria-hidden />}
          />
        </div>

        {/* Secondary KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'On probation', value: kpis.onProbation },
            { label: 'On notice', value: kpis.onNotice },
            { label: 'Absent today', value: kpis.absentToday },
            { label: 'On leave today', value: kpis.onLeaveToday },
            { label: 'Departments', value: kpis.departments },
            { label: 'Joined this month', value: kpis.joinedThisMonth },
          ].map((item) => (
            <div key={item.label} className="card px-3.5 py-3">
              <p className="text-[11px] font-medium text-ink-secondary">{item.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-ink">{formatNumber(item.value)}</p>
            </div>
          ))}
        </div>

        {/* Lists */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader
              title="Newest joiners"
              action={
                <Link
                  to="/employees?sortBy=joiningDate&sortDir=desc"
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  View all
                </Link>
              }
            />
            {data.recentHires.length === 0 ? (
              <EmptyState title="No hires yet" />
            ) : (
              <ul className="divide-y divide-hairline">
                {data.recentHires.map((hire) => (
                  <li key={hire.id}>
                    <Link
                      to={`/employees/${hire.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken sm:px-5"
                    >
                      <Avatar
                        name={`${hire.firstName} ${hire.lastName}`}
                        src={hire.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {hire.firstName} {hire.lastName}
                        </p>
                        <p className="truncate text-xs text-ink-secondary">
                          {hire.designation}
                          {hire.department ? ` · ${hire.department.name}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {formatDate(hire.joiningDate)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Coming up" description="Birthdays and work anniversaries" />
            {data.celebrations.length === 0 ? (
              <EmptyState
                icon={<PartyPopper className="h-6 w-6" aria-hidden />}
                title="Nothing in the next 30 days"
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {data.celebrations.map((event) => (
                  <li
                    key={`${event.employeeId}-${event.type}`}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                        event.type === 'BIRTHDAY'
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
                      )}
                      aria-hidden
                    >
                      {event.type === 'BIRTHDAY' ? (
                        <Cake className="h-4 w-4" />
                      ) : (
                        <TrendingUp className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{event.name}</p>
                      <p className="truncate text-xs text-ink-secondary">
                        {event.type === 'BIRTHDAY'
                          ? 'Birthday'
                          : `${event.years} year${event.years === 1 ? '' : 's'} at You Team`}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {formatRelative(event.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Announcements"
              action={
                <Link
                  to="/announcements"
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  View all
                </Link>
              }
            />
            {data.announcements.length === 0 ? (
              <EmptyState title="Nothing posted yet" />
            ) : (
              <ul className="divide-y divide-hairline">
                {data.announcements.map((announcement) => (
                  <li key={announcement.id} className="px-4 py-3 sm:px-5">
                    <div className="mb-1 flex items-start gap-2">
                      {announcement.pinned && (
                        <Pin className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" aria-label="Pinned" />
                      )}
                      <p className="min-w-0 flex-1 text-sm font-medium text-ink">
                        {announcement.title}
                      </p>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-ink-secondary">
                      {announcement.body}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {announcement.channel && <ChannelChip channel={announcement.channel} />}
                      <span className="text-[11px] text-ink-muted">
                        {formatRelative(announcement.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {data.upcomingHolidays.length > 0 && (
          <Card>
            <CardHeader title="Upcoming holidays" />
            <CardBody>
              <ul className="flex flex-wrap gap-2">
                {data.upcomingHolidays.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2"
                  >
                    <span className="text-sm font-medium text-ink">{holiday.name}</span>
                    <span className="tabular text-xs text-ink-secondary">
                      {formatDate(holiday.date)}
                    </span>
                    {holiday.isOptional && <Badge tone="neutral">Optional</Badge>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
