import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes so later conditional classes win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return precise ? inrPrecise.format(value) : inr.format(value);
}

/** Indian-market shorthand: ₹12.5L, ₹1.2Cr. Used where space is tight. */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN').format(value);
}

/** `2026-03-14` or an ISO timestamp → `14 Mar 2026`. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * `14 Mar 2026` for a single day, `14 → 18 Mar 2026` within one month, and
 * `28 Mar → 02 Apr 2026` across months. Dropping the repeated month and year
 * keeps date columns narrow enough to leave room for action buttons.
 */
export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  if (!start) return '—';
  if (!end || String(start) === String(end)) return formatDate(start);

  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '—';

  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth = sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();

  const day = (date: Date) => String(date.getUTCDate()).padStart(2, '0');
  const monthShort = (date: Date) =>
    new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(date);

  if (sameMonth) return `${day(startDate)} → ${formatDate(endDate)}`;
  if (sameYear) {
    return `${day(startDate)} ${monthShort(startDate)} → ${formatDate(endDate)}`;
  }
  return `${formatDate(startDate)} → ${formatDate(endDate)}`;
}

export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * The company's operating timezone. Timestamps are stored in UTC and always
 * rendered here, so a laptop set to another zone still shows the same clock
 * time as the office — which is what attendance records have to mean.
 */
export const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

/** `09:42 AM` in Asia/Kolkata, regardless of the viewer's own timezone. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  })
    .format(date)
    .toUpperCase();
}

/** `09:42:07 AM` in Asia/Kolkata, for the live clock. */
export function formatTimeWithSeconds(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  })
    .format(date)
    .toUpperCase();
}

/** `Friday, 24 October 2026` in Asia/Kolkata. */
export function formatBusinessDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** `8h 37m` from a minute count. Returns `0m` rather than a dash for zero. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function formatMonthYear(month: number, year: number): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/** `today`, `3 days ago`, `in 2 weeks`. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffDays = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day');
  if (Math.abs(diffDays) < 365) return formatter.format(Math.round(diffDays / 30), 'month');
  return formatter.format(Math.round(diffDays / 365), 'year');
}

export function formatHours(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** `NOTICE_PERIOD` → `Notice period`. */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '—';
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Today as `YYYY-MM-DD`, for date inputs. */
export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/** An ISO date/timestamp as `YYYY-MM-DD`, for date inputs. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** A stable, pleasant avatar background derived from a name. */
export function avatarTone(name: string): string {
  const tones = [
    'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200',
    'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
    'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
    'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
    'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200',
  ];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return tones[hash % tones.length]!;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
