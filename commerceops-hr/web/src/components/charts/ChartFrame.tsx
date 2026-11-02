import { useState, type ReactNode } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Wraps a chart with its title, legend and a table view.
 *
 * The table is not decoration: it is the accessibility fallback that makes every
 * plotted value readable without relying on colour, and the documented relief
 * for palette slots that sit below 3:1 contrast on the light surface.
 */
export function ChartFrame({
  title,
  description,
  series,
  tableColumns,
  tableRows,
  actions,
  height = 'h-64',
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Omitted or single-entry → no legend box (the title names the series). */
  series?: ChartSeries[];
  tableColumns: string[];
  tableRows: (string | number)[][];
  actions?: ReactNode;
  height?: string;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const showLegend = (series?.length ?? 0) >= 2;

  return (
    <section className={cn('card flex flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-secondary">{description}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {actions}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            aria-label={view === 'chart' ? 'Show as a table' : 'Show as a chart'}
            title={view === 'chart' ? 'Show as a table' : 'Show as a chart'}
          >
            {view === 'chart' ? (
              <Table2 className="h-4 w-4" aria-hidden />
            ) : (
              <BarChart3 className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      {showLegend && view === 'chart' && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pb-3 sm:px-5">
          {series!.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}

      {view === 'chart' ? (
        <div className={cn('w-full px-1 pb-3 sm:px-2', height)}>{children}</div>
      ) : (
        <TableWrap className="max-h-72 overflow-y-auto">
          <Table>
            <thead>
              <tr>
                {tableColumns.map((column, index) => (
                  <Th key={column} align={index === 0 ? 'left' : 'right'}>
                    {column}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, rowIndex) => (
                <Tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <Td
                      key={cellIndex}
                      align={cellIndex === 0 ? 'left' : 'right'}
                      className={cn(cellIndex > 0 && 'tabular')}
                    >
                      {cell}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}

/** Shared tooltip body so every chart's hover layer looks identical. */
export function ChartTooltip({
  label,
  rows,
}: {
  label: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2 shadow-popover">
      <p className="mb-1 text-xs font-semibold text-ink">{label}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            {row.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
            )}
            <span className="text-ink-secondary">{row.label}</span>
            <span className="tabular ml-auto font-medium text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
