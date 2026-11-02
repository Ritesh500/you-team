import type { ReactNode } from 'react';
import { CheckCircle2, Clock, CircleSlash, AlertTriangle, XCircle, Ban } from 'lucide-react';
import { cn, humanizeEnum } from '@/lib/utils';
import type {
  AttendanceStatus,
  EmployeeStatus,
  LeaveStatus,
  PayrollStatus,
  SalesChannel,
} from '@/types/api';

export type BadgeTone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-secondary ring-hairline',
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  warning:
    'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  serious:
    'bg-orange-50 text-orange-900 ring-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-800',
  critical:
    'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800',
  info: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-800',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// Status is never carried by colour alone — every badge below pairs its tone
// with the status word, and the decision-bearing ones add an icon.

const EMPLOYEE_TONES: Record<EmployeeStatus, BadgeTone> = {
  ACTIVE: 'good',
  PROBATION: 'info',
  ON_LEAVE: 'warning',
  NOTICE_PERIOD: 'serious',
  RESIGNED: 'neutral',
  TERMINATED: 'critical',
};

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return <Badge tone={EMPLOYEE_TONES[status]}>{humanizeEnum(status)}</Badge>;
}

const ATTENDANCE_TONES: Record<AttendanceStatus, BadgeTone> = {
  PRESENT: 'good',
  WORK_FROM_HOME: 'info',
  HALF_DAY: 'warning',
  ABSENT: 'critical',
  ON_LEAVE: 'serious',
  HOLIDAY: 'neutral',
  WEEK_OFF: 'neutral',
  MISSING_CHECKOUT: 'warning',
};

const ATTENDANCE_LABELS: Partial<Record<AttendanceStatus, string>> = {
  MISSING_CHECKOUT: 'Missing check-out',
  WORK_FROM_HOME: 'Work from home',
  WEEK_OFF: 'Week off',
  HALF_DAY: 'Half day',
  ON_LEAVE: 'On leave',
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <Badge
      tone={ATTENDANCE_TONES[status]}
      // The one status that needs HR action carries an icon as well as a tone.
      icon={
        status === 'MISSING_CHECKOUT' ? (
          <AlertTriangle className="h-3 w-3" aria-hidden />
        ) : undefined
      }
    >
      {ATTENDANCE_LABELS[status] ?? humanizeEnum(status)}
    </Badge>
  );
}

const LEAVE_TONES: Record<LeaveStatus, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'good',
  REJECTED: 'critical',
  CANCELLED: 'neutral',
};

const LEAVE_ICONS: Record<LeaveStatus, ReactNode> = {
  PENDING: <Clock className="h-3 w-3" aria-hidden />,
  APPROVED: <CheckCircle2 className="h-3 w-3" aria-hidden />,
  REJECTED: <XCircle className="h-3 w-3" aria-hidden />,
  CANCELLED: <CircleSlash className="h-3 w-3" aria-hidden />,
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <Badge tone={LEAVE_TONES[status]} icon={LEAVE_ICONS[status]}>
      {humanizeEnum(status)}
    </Badge>
  );
}

const PAYROLL_TONES: Record<PayrollStatus, BadgeTone> = {
  DRAFT: 'neutral',
  APPROVED: 'info',
  PAID: 'good',
};

const PAYROLL_ICONS: Record<PayrollStatus, ReactNode> = {
  DRAFT: <AlertTriangle className="h-3 w-3" aria-hidden />,
  APPROVED: <CheckCircle2 className="h-3 w-3" aria-hidden />,
  PAID: <CheckCircle2 className="h-3 w-3" aria-hidden />,
};

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  return (
    <Badge tone={PAYROLL_TONES[status]} icon={PAYROLL_ICONS[status]}>
      {humanizeEnum(status)}
    </Badge>
  );
}

export const CHANNEL_META: Record<
  SalesChannel,
  { label: string; dot: string; kind: string }
> = {
  SHOPIFY: { label: 'Shopify', dot: 'bg-shopify', kind: 'Own storefront' },
  AMAZON: { label: 'Amazon', dot: 'bg-amazon', kind: 'Marketplace' },
  FLIPKART: { label: 'Flipkart', dot: 'bg-flipkart', kind: 'Marketplace' },
  MYNTRA: { label: 'Myntra', dot: 'bg-myntra', kind: 'Fashion marketplace' },
};

/** Marketplace identity: a brand dot next to the name, never colour alone. */
export function ChannelChip({
  channel,
  suffix,
  className,
}: {
  channel: SalesChannel;
  suffix?: string;
  className?: string;
}) {
  const meta = CHANNEL_META[channel];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-secondary ring-1 ring-inset ring-hairline',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
      {suffix && <span className="tabular text-ink-muted">{suffix}</span>}
    </span>
  );
}

export function InactiveBadge() {
  return (
    <Badge tone="critical" icon={<Ban className="h-3 w-3" aria-hidden />}>
      Deactivated
    </Badge>
  );
}
