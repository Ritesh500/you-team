import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAttendanceAction, useEmployeeOptions } from '@/hooks/use-api';
import { formatTime, humanizeEnum, toDateInput } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import type { AttendanceRecord, AttendanceStatus } from '@/types/api';

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

const IST_OFFSET = '+05:30';

/** `HH:mm` in IST for a stored UTC instant, for the time inputs. */
function istTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/**
 * An IST wall-clock time on a given business date → a UTC ISO instant.
 * Building the string with an explicit +05:30 offset means the conversion never
 * depends on the HR user's own machine timezone.
 */
function istToIso(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const parsed = new Date(`${date}T${time}:00.000${IST_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * HR correction dialog. The reason is mandatory — the server rejects anything
 * under 10 characters — and the before/after values go to the audit log.
 */
export function CorrectionModal({
  open,
  onClose,
  record,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  /** Present → editing an existing record; absent → recording a fresh one. */
  record?: AttendanceRecord | null;
  defaultDate?: string;
}) {
  const { data: employeeOptions } = useEmployeeOptions();
  const { correct } = useAttendanceAction();

  const [form, setForm] = useState({
    employeeId: '',
    date: '',
    status: 'PRESENT' as AttendanceStatus,
    checkIn: '',
    checkOut: '',
    reason: '',
  });
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      employeeId: record?.employeeId ?? '',
      date: record ? toDateInput(record.date) : (defaultDate ?? toDateInput(new Date())),
      status: record?.status ?? 'PRESENT',
      checkIn: istTimeInput(record?.checkIn),
      checkOut: istTimeInput(record?.checkOut),
      reason: '',
    });
    setApiError(null);
  }, [open, record, defaultDate]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);

    const checkIn = istToIso(form.date, form.checkIn);
    const checkOut = istToIso(form.date, form.checkOut);

    try {
      await correct.mutateAsync({
        employeeId: form.employeeId,
        date: form.date,
        status: form.status,
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        reason: form.reason.trim(),
      });
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  const employeeName = record
    ? `${record.employee.firstName} ${record.employee.lastName}`
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employeeName ? `Correct attendance — ${employeeName}` : 'Record attendance'}
      description="Times are entered and shown in IST. Every correction is written to the audit log with your name and reason."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={correct.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="correction-form" isLoading={correct.isPending}>
            Save correction
          </Button>
        </>
      }
    >
      <form id="correction-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && !apiError.fieldErrors.length && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        {record && (
          <div className="rounded-lg bg-surface-sunken p-3 text-xs">
            <p className="mb-1 font-semibold text-ink">Current values</p>
            <p className="text-ink-secondary">
              {humanizeEnum(record.status)} · in {formatTime(record.checkIn)} · out{' '}
              {formatTime(record.checkOut)}
            </p>
          </div>
        )}

        <Select
          label="Employee"
          value={form.employeeId}
          onChange={(event) => setForm((p) => ({ ...p, employeeId: event.target.value }))}
          error={apiError?.fieldError('employeeId')}
          disabled={Boolean(record)}
          required
        >
          <option value="">Select someone…</option>
          {(employeeOptions ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.firstName} {option.lastName} — {option.designation}
            </option>
          ))}
        </Select>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(event) => setForm((p) => ({ ...p, date: event.target.value }))}
            error={apiError?.fieldError('date')}
            disabled={Boolean(record)}
            required
          />
          <Select
            label="Status"
            value={form.status}
            onChange={(event) =>
              setForm((p) => ({ ...p, status: event.target.value as AttendanceStatus }))
            }
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'MISSING_CHECKOUT' ? 'Missing check-out' : humanizeEnum(status)}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Check in (IST)"
            type="time"
            value={form.checkIn}
            onChange={(event) => setForm((p) => ({ ...p, checkIn: event.target.value }))}
            error={apiError?.fieldError('checkIn')}
            hint="Leave blank for a non-working day"
          />
          <Input
            label="Check out (IST)"
            type="time"
            value={form.checkOut}
            onChange={(event) => setForm((p) => ({ ...p, checkOut: event.target.value }))}
            error={apiError?.fieldError('checkOut')}
            hint="Must be after the check-in"
          />
        </div>

        <Textarea
          label="Reason for this correction"
          value={form.reason}
          onChange={(event) => setForm((p) => ({ ...p, reason: event.target.value }))}
          error={apiError?.fieldError('reason')}
          placeholder="Employee forgot to check out; confirmed 6:30 PM exit with the warehouse lead."
          hint="Required, at least 10 characters. Stored in the audit log."
          rows={3}
          required
        />
      </form>
    </Modal>
  );
}
