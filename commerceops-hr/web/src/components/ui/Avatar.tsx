import { avatarTone, cn, initials } from '@/lib/utils';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
} as const;

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-hairline', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1 ring-black/5 dark:ring-white/10',
        avatarTone(name),
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar + name + secondary line, the shape used in most table cells. */
export function PersonCell({
  name,
  secondary,
  src,
  size = 'sm',
  className,
}: {
  name: string;
  secondary?: string | null;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={name} src={src} size={size} />
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{name}</p>
        {secondary && <p className="truncate text-xs text-ink-secondary">{secondary}</p>}
      </div>
    </div>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 'xs',
}: {
  people: { name: string; avatarUrl?: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          src={person.avatarUrl}
          size={size}
          className="-ml-1.5 ring-2 ring-surface first:ml-0"
        />
      ))}
      {overflow > 0 && (
        <span className="-ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-semibold text-ink-secondary ring-2 ring-surface">
          +{overflow}
        </span>
      )}
    </div>
  );
}
