import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { DesktopSidebar, MobileSidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the drawer and return to the top of the page on navigation.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-plane">
      <DesktopSidebar />
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[100rem] px-3 py-5 sm:px-5 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
