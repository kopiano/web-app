const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8100/api/')
  .replace(/\/?$/, '/');

export const AUTH_CHANGED_EVENT = 'auth:changed';

export function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export const authStorage = {
  getToken: () => localStorage.getItem('token') || localStorage.getItem('auth_token'),
  setToken: (token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('auth_token', token);
  },
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setRefreshToken: (token: string) => localStorage.setItem('refresh_token', token),
  clear: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
  },
};

export const githubLoginUrl = `${API_BASE}auth/github/login`;

// OAuth must use a top-level browser navigation so the backend can redirect to GitHub.
export function startGithubLogin() {
  window.location.href = githubLoginUrl;
}

export async function logout() {
  const refreshToken = authStorage.getRefreshToken();
  await fetch(`${API_BASE}auth/logout`, {
    method: 'POST',
    headers: refreshToken ? { 'X-Refresh-Token': refreshToken } : undefined,
  });
  authStorage.clear();
}

export async function refreshToken() {
  const refresh = authStorage.getRefreshToken();
  if (!refresh) return false;
  const response = await fetch(`${API_BASE}auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!response.ok) {
    authStorage.clear();
    return false;
  }
  const body = await response.json() as {
    code: number;
    message: string;
    data: { token: string };
  };
  if (body.code !== 200 || !body.data?.token) {
    authStorage.clear();
    return false;
  }
  const token = body.data.token;
  authStorage.setToken(token);
  return true;
}

export async function getCurrentUser() {
  const token = authStorage.getToken();
  const response = await fetch(`${API_BASE}users/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = await response.json() as {
    code: number;
    message: string;
    data: unknown;
  };
  if (!response.ok || body.code !== 200) {
    throw new Error(body.message || 'Unable to load current user');
  }
  return body.data;
}
