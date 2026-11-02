import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LogOut, Menu, Moon, Sun, User as UserIcon, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { ROLE_LABELS, useAuthStore } from '@/store/auth';
import { useTheme } from '@/hooks/use-theme';
import { cn, formatDateLong } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { LeaveRequest, Paginated } from '@/types/api';

function PendingApprovals() {
  const role = useAuthStore((state) => state.user?.role);
  const canApprove = role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'MANAGER';

  const { data } = useQuery({
    queryKey: queryKeys.leaveRequests({ status: 'PENDING', pageSize: 1 }),
    queryFn: async () => {
      const { data } = await api.get<Paginated<LeaveRequest>>('/leave/requests', {
        params: { status: 'PENDING', pageSize: 1 },
      });
      return data;
    },
    enabled: canApprove,
  });

  const count = data?.meta.total ?? 0;
  if (!canApprove || count === 0) return null;

  return (
    <Link
      to="/leave?status=PENDING"
      className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink sm:flex"
    >
      <Clock className="h-3.5 w-3.5" aria-hidden />
      <span>{count} pending</span>
      <Badge tone="warning">{count === 1 ? 'approval' : 'approvals'}</Badge>
    </Link>
  );
}

function UserMenu() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-surface-sunken"
      >
        <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-ink">
            {user.fullName}
          </span>
          <span className="block text-[11px] text-ink-muted">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-60 animate-slide-up overflow-hidden rounded-xl border border-hairline bg-surface shadow-popover"
        >
          <div className="border-b border-hairline px-3.5 py-3">
            <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-secondary">{user.email}</p>
            {user.designation && (
              <p className="mt-1 truncate text-xs text-ink-muted">
                {user.designation}
                {user.department ? ` · ${user.department.name}` : ''}
              </p>
            )}
          </div>

          <div className="p-1">
            <Link
              to="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              <UserIcon className="h-4 w-4" aria-hidden />
              My profile &amp; settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await logout();
                navigate('/login', { replace: true });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-critical transition-colors hover:bg-rose-50 dark:hover:bg-rose-950"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-hairline bg-surface/90 px-3 backdrop-blur sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      <p className="hidden text-sm text-ink-secondary md:block">
        {formatDateLong(new Date().toISOString().slice(0, 10))}
      </p>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <PendingApprovals />

        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </Button>

        <UserMenu />
      </div>
    </header>
  );
}
