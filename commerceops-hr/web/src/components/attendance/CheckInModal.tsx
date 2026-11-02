import { useEffect, useState } from 'react';
import { Building2, Home, MapPin } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAttendanceAction } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { WorkLocation } from '@/types/api';

const OPTIONS: {
  value: WorkLocation;
  label: string;
  hint: string;
  icon: typeof Home;
}[] = [
  { value: 'OFFICE', label: 'Work from office', hint: 'At the usual workplace', icon: Building2 },
  { value: 'HOME', label: 'Work from home', hint: 'Tell us where', icon: Home },
  { value: 'OTHER', label: 'Other', hint: 'Client site, travel, co-working…', icon: MapPin },
];

/**
 * Asks where the employee is working before the punch is sent. Anything other
 * than the office needs a location, which the server also enforces.
 */
export function CheckInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { checkIn } = useAttendanceAction();

  const [location, setLocation] = useState<WorkLocation>('OFFICE');
  const [detail, setDetail] = useState('');
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocation('OFFICE');
    setDetail('');
    setApiError(null);
  }, [open]);

  const needsDetail = location !== 'OFFICE';

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    try {
      await checkIn.mutateAsync({
        workLocation: location,
        ...(needsDetail ? { workLocationDetail: detail.trim() } : {}),
      });
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Where are you working today?"
      description="Your check-in time is recorded by the server the moment you confirm."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={checkIn.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="check-in-form" isLoading={checkIn.isPending}>
            Confirm check in
          </Button>
        </>
      }
    >
      <form id="check-in-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && !apiError.fieldErrors.length && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        <div role="radiogroup" aria-label="Work location" className="space-y-2">
          {OPTIONS.map((option) => {
            const selected = location === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setLocation(option.value);
                  setApiError(null);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selected
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                    : 'border-hairline hover:bg-surface-sunken',
                )}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                    selected
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-sunken text-ink-muted',
                  )}
                  aria-hidden
                >
                  <option.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      selected ? 'text-brand-900 dark:text-brand-100' : 'text-ink',
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="block text-xs text-ink-secondary">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {needsDetail && (
          <Input
            label={location === 'HOME' ? 'Where are you working from?' : 'Location'}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            error={apiError?.fieldError('workLocationDetail')}
            placeholder={
              location === 'HOME' ? 'Home — Bengaluru' : 'Client office, Mumbai'
            }
            hint="Required for anything other than the office"
            autoFocus
            required
          />
        )}
      </form>
    </Modal>
  );
}
