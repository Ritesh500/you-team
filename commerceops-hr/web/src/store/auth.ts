import { create } from 'zustand';
import { api, tokenStore } from '@/lib/api';
import type { LoginResponse, Role, SessionUser } from '@/types/api';

interface AuthState {
  user: SessionUser | null;
  /** True until the initial `/auth/me` check settles, so routes don't flash. */
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,

  async login(email, password) {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
    tokenStore.set(data.accessToken, data.refreshToken);
    set({ user: data.user });
  },

  async logout() {
    try {
      await api.post('/auth/logout', { refreshToken: tokenStore.getRefresh() });
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    tokenStore.clear();
    set({ user: null });
  },

  /** Restores the session from a stored token on a page load. */
  async bootstrap() {
    if (!tokenStore.getAccess()) {
      set({ user: null, isBootstrapping: false });
      return;
    }

    try {
      const { data } = await api.get<{ user: SessionUser }>('/auth/me');
      set({ user: data.user, isBootstrapping: false });
    } catch {
      tokenStore.clear();
      set({ user: null, isBootstrapping: false });
    }
  },

  setUser(user) {
    set({ user });
  },
}));

// ----------------------------- Permissions ---------------------------------

const HR_ROLES: Role[] = ['SUPER_ADMIN', 'HR_MANAGER'];
const MANAGEMENT_ROLES: Role[] = ['SUPER_ADMIN', 'HR_MANAGER', 'MANAGER'];

/**
 * Mirrors the server's RBAC so the UI hides what the API would reject. The
 * server remains the only authority — this just avoids dead-end buttons.
 */
export const can = {
  manageEmployees: (role: Role | undefined) => !!role && HR_ROLES.includes(role),
  deleteEmployees: (role: Role | undefined) => role === 'SUPER_ADMIN',
  manageDepartments: (role: Role | undefined) => !!role && HR_ROLES.includes(role),
  managePayroll: (role: Role | undefined) => !!role && HR_ROLES.includes(role),
  manageUsers: (role: Role | undefined) => !!role && HR_ROLES.includes(role),
  manageChannels: (role: Role | undefined) => !!role && HR_ROLES.includes(role),
  markAttendance: (role: Role | undefined) => !!role && HR_ROLES.includes(role),
  approveLeave: (role: Role | undefined) => !!role && MANAGEMENT_ROLES.includes(role),
  viewTeamData: (role: Role | undefined) => !!role && MANAGEMENT_ROLES.includes(role),
  postAnnouncements: (role: Role | undefined) => !!role && HR_ROLES.includes(role),
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  HR_MANAGER: 'HR manager',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};
