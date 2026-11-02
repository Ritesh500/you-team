import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Stat tile: label (sentence case) · value (semibold, proportional figures) ·
 * optional delta signed against a named period · optional icon.
 *
 * Deltas never rely on colour alone — the arrow icon carries the direction.
 */
export function StatTile({
  label,
  value,
  sublabel,
  delta,
  icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  delta?: { value: number; period: string; upIsGood?: boolean };
  icon?: ReactNode;
  tone?: 'default' | 'attention';
  className?: string;
}) {
  const upIsGood = delta?.upIsGood ?? true;
  const isUp = (delta?.value ?? 0) >= 0;
  const isGood = isUp === upIsGood;

  return (
    <div
      className={cn(
        'card flex flex-col justify-between gap-3 p-4',
        tone === 'attention' && 'ring-1 ring-brand-200 dark:ring-brand-800',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-secondary">{label}</p>
        {icon && <span className="shrink-0 text-ink-muted">{icon}</span>}
      </div>

      <div>
        <p className="text-2xl font-semibold leading-none tracking-tight text-ink">{value}</p>

        {(sublabel || delta) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {delta && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-medium',
                  isGood
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400',
                )}
              >
                {isUp ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="h-3 w-3" aria-hidden />
                )}
                {isUp ? '+' : ''}
                {delta.value}
                <span className="font-normal text-ink-muted"> {delta.period}</span>
              </span>
            )}
            {sublabel && <span className="text-xs text-ink-muted">{sublabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Meter: the fill carries severity, the track is a lighter step of the same
 * ramp, and the numeric value is always printed beside it.
 */
export function Meter({
  label,
  value,
  max,
  unit = '',
  tone = 'brand',
  className,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  tone?: 'brand' | 'good' | 'warning' | 'critical';
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  const fills = {
    brand: 'bg-brand-600',
    good: 'bg-emerald-600',
    warning: 'bg-amber-500',
    critical: 'bg-rose-600',
  } as const;

  const tracks = {
    brand: 'bg-brand-100 dark:bg-brand-950',
    good: 'bg-emerald-100 dark:bg-emerald-950',
    warning: 'bg-amber-100 dark:bg-amber-950',
    critical: 'bg-rose-100 dark:bg-rose-950',
  } as const;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-ink-secondary">{label}</span>
        <span className="tabular shrink-0 text-xs text-ink">
          {value}
          {unit} <span className="text-ink-muted">/ {max}{unit}</span>
        </span>
      </div>
      <div
        className={cn('h-2 w-full overflow-hidden rounded-full', tracks[tone])}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', fills[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
