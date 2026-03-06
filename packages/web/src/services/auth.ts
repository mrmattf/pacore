import { useAuthStore } from '../store/authStore';

const API_URL = '/v1';

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  return response.json(); // { token, refreshToken, user }
}

export async function register(email: string, password: string, name?: string) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    throw new Error('Registration failed');
  }

  return response.json(); // { token, refreshToken, user }
}

export async function refreshAccessToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw new Error('Refresh failed');
  }

  return response.json();
}

/**
 * Authenticated fetch wrapper.
 * On 401, attempts to silently refresh the access token once and retries.
 * If refresh fails, logs the user out and redirects to /login.
 */
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const { token, refreshToken, updateToken, logout } = useAuthStore.getState();

  const doFetch = (accessToken: string | null) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let response = await doFetch(token);

  if (response.status !== 401 || !refreshToken) {
    return response;
  }

  // 401 and we have a refresh token — try to refresh
  if (isRefreshing) {
    // Wait for the in-flight refresh to complete
    const newToken = await new Promise<string>((resolve) => refreshQueue.push(resolve));
    return doFetch(newToken);
  }

  isRefreshing = true;
  try {
    const refreshed = await refreshAccessToken(refreshToken);
    updateToken(refreshed.token, refreshed.refreshToken);
    refreshQueue.forEach((resolve) => resolve(refreshed.token));
    refreshQueue = [];
    response = await doFetch(refreshed.token);
  } catch {
    // Refresh failed — log out and redirect
    logout();
    window.location.href = '/login';
    return response;
  } finally {
    isRefreshing = false;
  }

  return response;
}
