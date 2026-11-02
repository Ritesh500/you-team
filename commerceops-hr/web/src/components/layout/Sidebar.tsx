import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { NAV_SECTIONS, visibleNavItems } from './nav-items';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-base font-bold text-white"
        aria-hidden
      >
        Y
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-ink">You Team</p>
        <p className="truncate text-[11px] text-ink-muted">HR &amp; People Ops</p>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const role = useAuthStore((state) => state.user?.role);
  const items = visibleNavItems(role);

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {NAV_SECTIONS.map((section) => {
        const sectionItems = items.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;

        return (
          <div key={section}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              {section}
            </p>
            <ul className="space-y-0.5">
              {sectionItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand-600 text-white'
                          : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn('h-4 w-4 shrink-0', !isActive && 'text-ink-muted')}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-hairline px-4 py-3">
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Shopify · Amazon · Flipkart · Myntra
        <br />
        <span className="text-ink-muted/70">v1.0.0</span>
      </p>
    </div>
  );
}

/** Fixed sidebar, desktop only (lg and up). */
export function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-hairline bg-surface lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-hairline px-4">
        <Logo />
      </div>
      <NavItems />
      <SidebarFooter />
    </aside>
  );
}

/** Off-canvas drawer for tablet and phone. */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="relative flex h-full w-[17rem] max-w-[85vw] animate-slide-in-left flex-col border-r border-hairline bg-surface shadow-popover"
        aria-label="Navigation menu"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-4">
          <Logo />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close navigation">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <NavItems onNavigate={onClose} />
        <SidebarFooter />
      </aside>
    </div>
  );
}
