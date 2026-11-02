import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/types/api';
import { formatNumber } from '@/lib/utils';
import { Button } from './Button';

export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'records',
}: {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  itemLabel?: string;
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
      <p className="text-xs text-ink-secondary">
        Showing <span className="tabular font-medium text-ink">{formatNumber(from)}</span>–
        <span className="tabular font-medium text-ink">{formatNumber(to)}</span> of{' '}
        <span className="tabular font-medium text-ink">{formatNumber(meta.total)}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="hidden items-center gap-1.5 text-xs text-ink-secondary sm:flex">
            Rows
            <select
              value={meta.pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasPrevious}
          onClick={() => onPageChange(meta.page - 1)}
          leadingIcon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden />}
          aria-label="Previous page"
        >
          <span className="hidden sm:inline">Previous</span>
        </Button>

        <span className="tabular whitespace-nowrap px-1 text-xs text-ink-secondary">
          {meta.page} / {meta.totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasNext}
          onClick={() => onPageChange(meta.page + 1)}
          trailingIcon={<ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
        </Button>
      </div>
    </div>
  );
}
