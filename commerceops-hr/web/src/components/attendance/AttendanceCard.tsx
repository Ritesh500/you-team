import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock,
  Home,
  LogIn,
  LogOut,
  MapPin,
  Timer,
} from 'lucide-react';
import { useAttendanceAction, useAttendanceToday } from '@/hooks/use-api';
import { useAuthStore } from '@/store/auth';
import {
  cn,
  formatBusinessDate,
  formatDuration,
  formatTime,
  formatTimeWithSeconds,
} from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { AttendanceStatusBadge, Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/States';
import { CheckInModal } from './CheckInModal';
import { WorkReportSection } from './WorkReportSection';
import type { WorkLocation } from '@/types/api';

const WORK_LOCATION_META: Record<
  WorkLocation,
  { label: string; icon: typeof Home }
> = {
  OFFICE: { label: 'Office', icon: Building2 },
  HOME: { label: 'Home', icon: Home },
  OTHER: { label: 'Other', icon: MapPin },
};

/** One labelled figure in the card's stat row. */
function Stat({
  icon,
  label,
  value,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-sunken px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary">
        <span className="shrink-0 text-ink-muted" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <p
        className={cn(
          'tabular mt-1 truncate font-semibold text-ink',
          emphasis ? 'text-lg' : 'text-sm',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Check in / check out for the signed-in employee.
 *
 * Every timestamp shown here comes from the server and is rendered in IST, so
 * the card reads the same regardless of the viewer's own machine clock.
 */
export function AttendanceCard({ className }: { className?: string }) {
  const employeeId = useAuthStore((state) => state.user?.employeeId);
  const { data: today, isLoading, isError, refetch } = useAttendanceToday();
  const { checkOut } = useAttendanceAction();
  const [checkInOpen, setCheckInOpen] = useState(false);

  // Ticks once a second so the live duration and clock advance while working.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!today?.isWorking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [today?.isWorking]);

  // A login with no employee record (the root admin) has no attendance to take.
  if (!employeeId) return null;

  if (isLoading) {
    return (
      <section className={cn('card p-4 sm:p-5', className)}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-56" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      </section>
    );
  }

  if (isError || !today) {
    return (
      <section className={cn('card p-4 sm:p-5', className)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-secondary">
            Could not load today&apos;s attendance.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  const record = today.record;
  const isWorking = today.isWorking;
  const isPending = checkOut.isPending;
  const locationMeta = record?.workLocation
    ? WORK_LOCATION_META[record.workLocation]
    : null;

  // While working, count from check-in against the ticking clock; once checked
  // out, the server's stored total is authoritative.
  const liveMinutes = isWorking && record?.checkIn
    ? Math.max(0, Math.floor((now - new Date(record.checkIn).getTime()) / 60_000))
    : (record?.workedMinutes ?? 0);

  const hasCheckedOut = Boolean(record?.checkOut);

  return (
    <section
      className={cn(
        'card overflow-hidden',
        isWorking && 'ring-1 ring-brand-300 dark:ring-brand-700',
        className,
      )}
      aria-label="Today's attendance"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Header: date, live status, and the action button */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
              {formatBusinessDate(today.businessDate)}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {isWorking ? (
                <span className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
                  <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  </span>
                  Currently working
                </span>
              ) : hasCheckedOut ? (
                <span className="text-lg font-semibold text-ink">Day complete</span>
              ) : (
                <span className="text-lg font-semibold text-ink">Not checked in yet</span>
              )}

              {record && <AttendanceStatusBadge status={record.status} />}

              {locationMeta && (
                <Badge tone="neutral" icon={<locationMeta.icon className="h-3 w-3" aria-hidden />}>
                  {record?.workLocationDetail
                    ? `${locationMeta.label} · ${record.workLocationDetail}`
                    : locationMeta.label}
                </Badge>
              )}
            </div>

            <p className="mt-1 text-xs text-ink-muted">
              {isWorking
                ? `Since ${formatTime(record!.checkIn)} · now ${formatTimeWithSeconds(new Date(now))} IST`
                : hasCheckedOut
                  ? `Checked out at ${formatTime(record!.checkOut)} IST`
                  : 'Your check-in time is recorded by the server, not your device.'}
            </p>
          </div>

          <div className="shrink-0">
            {today.canCheckIn ? (
              <Button
                size="lg"
                onClick={() => setCheckInOpen(true)}
                disabled={isPending}
                leadingIcon={<LogIn className="h-4 w-4" aria-hidden />}
              >
                Check in
              </Button>
            ) : today.canCheckOut ? (
              <Button
                size="lg"
                variant="secondary"
                onClick={() => checkOut.mutate()}
                isLoading={checkOut.isPending}
                disabled={isPending}
                leadingIcon={<LogOut className="h-4 w-4" aria-hidden />}
              >
                Check out
              </Button>
            ) : (
              <Badge tone="good">Checked out for today</Badge>
            )}
          </div>
        </div>

        {/* Figures */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            icon={<LogIn className="h-3 w-3" aria-hidden />}
            label="Check in"
            value={record?.checkIn ? formatTime(record.checkIn) : '—'}
          />
          <Stat
            icon={<LogOut className="h-3 w-3" aria-hidden />}
            label="Check out"
            value={record?.checkOut ? formatTime(record.checkOut) : '—'}
          />
          <Stat
            icon={<Timer className="h-3 w-3" aria-hidden />}
            label={isWorking ? 'Working time' : 'Total hours'}
            value={record?.checkIn ? formatDuration(liveMinutes) : '—'}
            emphasis
          />
          <Stat
            icon={<Clock className="h-3 w-3" aria-hidden />}
            label="Status"
            value={
              isWorking
                ? 'Working'
                : hasCheckedOut
                  ? 'Complete'
                  : record?.status === 'WEEK_OFF'
                    ? 'Week off'
                    : record?.status === 'HOLIDAY'
                      ? 'Holiday'
                      : 'Pending'
            }
          />
        </div>

        {record?.status === 'MISSING_CHECKOUT' && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              This day was never checked out, so no hours were counted. HR has to correct it —
              a checkout time is never filled in automatically.
            </span>
          </p>
        )}

        {record?.correctionReason && (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary">
            <span className="font-medium text-ink">Corrected by HR:</span>{' '}
            {record.correctionReason}
          </p>
        )}
      </div>

      <WorkReportSection today={today} />

      <CheckInModal open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </section>
  );
}
