import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Wide tables scroll inside this wrapper so the page body never scrolls
 * horizontally on a phone.
 */
export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('scroll-x -mx-px', className)}>{children}</div>;
}

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>;
}

export function Th({
  className,
  children,
  align = 'left',
  scope = 'col',
}: {
  className?: string;
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  scope?: 'col' | 'row';
}) {
  return (
    <th
      scope={scope}
      className={cn(
        'whitespace-nowrap border-b border-hairline bg-surface-sunken px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-secondary',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  align = 'left',
  colSpan,
}: {
  className?: string;
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-hairline px-4 py-3 align-middle text-ink',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <tr
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        }}
        tabIndex={0}
        role="button"
        className={cn(
          'cursor-pointer transition-colors last:[&>td]:border-b-0 hover:bg-surface-sunken',
          className,
        )}
      >
        {children}
      </tr>
    );
  }

  return (
    <tr className={cn('last:[&>td]:border-b-0', className)}>{children}</tr>
  );
}
