import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarCheck,
  CalendarOff,
  Wallet,
  ShoppingBag,
  ShieldCheck,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Omitted → visible to every signed-in role. */
  roles?: Role[];
  section: 'Overview' | 'People' | 'Operations' | 'Administration';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },

  { to: '/employees', label: 'Employees', icon: Users, section: 'People' },
  { to: '/departments', label: 'Departments', icon: Building2, section: 'People' },
  { to: '/channels', label: 'Sales channels', icon: ShoppingBag, section: 'People' },

  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, section: 'Operations' },
  { to: '/leave', label: 'Leave', icon: CalendarOff, section: 'Operations' },
  {
    to: '/payroll',
    label: 'Payroll',
    icon: Wallet,
    roles: ['SUPER_ADMIN', 'HR_MANAGER'],
    section: 'Operations',
  },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, section: 'Operations' },

  {
    to: '/admin',
    label: 'Users & access',
    icon: ShieldCheck,
    roles: ['SUPER_ADMIN', 'HR_MANAGER'],
    section: 'Administration',
  },
];

export const NAV_SECTIONS = ['Overview', 'People', 'Operations', 'Administration'] as const;

export function visibleNavItems(role: Role | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
