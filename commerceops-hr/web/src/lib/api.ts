import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiFieldError, LoginResponse } from '@/types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

const ACCESS_TOKEN_KEY = 'youteam-access-token';
const REFRESH_TOKEN_KEY = 'youteam-refresh-token';

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  set(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/** Normalised error the UI can render without knowing about axios. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: ApiFieldError[];

  constructor(status: number, code: string, message: string, fieldErrors: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** The message for a specific form field, if the server flagged one. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((error) => error.field === field)?.message;
  }
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Called when refresh fails, so the app can route back to the login screen. */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

/**
 * Concurrent 401s share a single refresh call; the rest queue behind it rather
 * than each firing their own (which would invalidate the rotated token).
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) throw new Error('no refresh token');

  // A bare axios call: the instance's interceptors would recurse.
  const { data } = await axios.post<LoginResponse>(
    `${BASE_URL}/auth/refresh`,
    { refreshToken },
    { withCredentials: true },
  );

  tokenStore.set(data.accessToken, data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: { code?: string; message?: string; details?: unknown } }>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status ?? 0;
    const payload = error.response?.data?.error;

    const isAuthEndpoint = original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh');

    // Expired access token: refresh once, then replay the original request.
    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      try {
        refreshInFlight ??= refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
        const token = await refreshInFlight;
        original.headers.Authorization = `Bearer ${token}`;
        return api.request(original);
      } catch {
        tokenStore.clear();
        onSessionExpired?.();
        throw new ApiError(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.');
      }
    }

    if (error.code === 'ERR_NETWORK' || status === 0) {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Cannot reach the API. Is the server running on port 4000?',
      );
    }

    const details = Array.isArray(payload?.details) ? (payload.details as ApiFieldError[]) : [];

    throw new ApiError(
      status,
      payload?.code ?? 'UNKNOWN',
      payload?.message ?? error.message ?? 'Something went wrong.',
      details,
    );
  },
);

/** Strip undefined/empty values so they don't become `?x=undefined`. */
export function cleanParams<T extends object>(params: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}
