import { useState } from 'react';
import { Check, ClipboardList, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useWorkReportActions } from '@/hooks/use-api';
import { cn, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Select, Textarea } from '@/components/ui/Field';
import type { TodayAttendance, WorkReport, WorkReportStatus } from '@/types/api';

const STATUS_LABELS: Record<WorkReportStatus, string> = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  PENDING: 'Pending',
};

const STATUS_TONES: Record<WorkReportStatus, BadgeTone> = {
  COMPLETED: 'good',
  IN_PROGRESS: 'info',
  PENDING: 'warning',
};

export function WorkReportStatusBadge({ status }: { status: WorkReportStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** One report: read-only row, or an inline editor when being edited. */
function ReportRow({
  report,
  editable,
}: {
  report: WorkReport;
  editable: boolean;
}) {
  const { update, remove } = useWorkReportActions();
  const [isEditing, setIsEditing] = useState(false);
  const [details, setDetails] = useState(report.details);
  const [status, setStatus] = useState<WorkReportStatus>(report.status);

  if (isEditing) {
    return (
      <li className="rounded-lg border border-brand-300 bg-surface p-3 dark:border-brand-700">
        <Textarea
          label="Task details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={2}
        />
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as WorkReportStatus)}
            containerClassName="w-40"
          >
            {(Object.keys(STATUS_LABELS) as WorkReportStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            isLoading={update.isPending}
            onClick={async () => {
              await update.mutateAsync({ id: report.id, details: details.trim(), status });
              setIsEditing(false);
            }}
            leadingIcon={<Check className="h-3.5 w-3.5" aria-hidden />}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDetails(report.details);
              setStatus(report.status);
              setIsEditing(false);
            }}
            leadingIcon={<X className="h-3.5 w-3.5" aria-hidden />}
          >
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 rounded-lg bg-surface-sunken p-3">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words text-sm text-ink">{report.details}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <WorkReportStatusBadge status={report.status} />
          <span className="tabular text-[11px] text-ink-muted">
            added {formatTime(report.createdAt)}
          </span>
        </div>
      </div>

      {editable && (
        <div className="flex shrink-0 gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing(true)}
            aria-label="Edit this work report"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove.mutate(report.id)}
            disabled={remove.isPending}
            aria-label="Remove this work report"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5 text-critical" aria-hidden />
          </Button>
        </div>
      )}
    </li>
  );
}

/** The add-a-task form, shown only while the day is open. */
function AddReportForm() {
  const { add } = useWorkReportActions();
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<WorkReportStatus>('IN_PROGRESS');

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (details.trim().length < 3) return;
    await add.mutateAsync({ details: details.trim(), status });
    setDetails('');
    setStatus('IN_PROGRESS');
  };

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-hairline p-3">
      <Textarea
        label="What did you work on?"
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Reconciled Amazon settlement report for September"
        rows={2}
      />
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Select
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as WorkReportStatus)}
          containerClassName="w-40"
        >
          {(Object.keys(STATUS_LABELS) as WorkReportStatus[]).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Button
          type="submit"
          isLoading={add.isPending}
          disabled={details.trim().length < 3}
          leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
        >
          Add task
        </Button>
      </div>
    </form>
  );
}

/**
 * The day's work report. Appears once the employee has checked in, accepts any
 * number of tasks while the day is open, and freezes at check-out — each new
 * working day starts with an empty set.
 */
export function WorkReportSection({
  today,
  className,
}: {
  today: TodayAttendance;
  className?: string;
}) {
  const reports = today.record?.workReports ?? [];

  // Nothing to show before the first punch of the day.
  if (!today.record?.checkIn) return null;

  const editable = today.canEditWorkReports;
  const locked = today.workReportsLocked;

  const completed = reports.filter((r) => r.status === 'COMPLETED').length;

  return (
    <section
      className={cn('border-t border-hairline px-4 py-4 sm:px-5', className)}
      aria-label="Work report"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <h3 className="text-sm font-semibold text-ink">Work report</h3>
          {reports.length > 0 && (
            <span className="tabular text-xs text-ink-muted">
              {completed}/{reports.length} completed
            </span>
          )}
        </div>

        {locked && (
          <Badge tone="neutral" icon={<Lock className="h-3 w-3" aria-hidden />}>
            Locked for the day
          </Badge>
        )}
      </div>

      {reports.length === 0 ? (
        <p className="mb-3 text-sm text-ink-secondary">
          {editable
            ? 'No tasks logged yet. Add what you are working on — you can add as many as you like through the day.'
            : 'No tasks were logged for this day.'}
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} editable={editable} />
          ))}
        </ul>
      )}

      {editable ? (
        <AddReportForm />
      ) : locked ? (
        <p className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            You checked out, so this report is saved against today&apos;s attendance and can no
            longer be edited. Your next check-in starts a fresh report.
          </span>
        </p>
      ) : null}
    </section>
  );
}
