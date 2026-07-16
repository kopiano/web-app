const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8100/api/')
  .replace(/\/?$/, '/');

export const AUTH_CHANGED_EVENT = 'auth:changed';
export const AUTH_LOGGED_OUT_KEY = 'auth_logged_out';
export const AUTH_RETURN_TO_KEY = 'auth_return_to';
export const AUTH_SESSION_HINT_KEY = 'auth_session_active';

function currentLocationPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function normalizeAuthReturnTo(returnTo: string | null | undefined) {
  if (
    !returnTo
    || !returnTo.startsWith('/')
    || returnTo.startsWith('//')
    || returnTo.startsWith('/oauth/success')
  ) {
    return '/';
  }
  return returnTo;
}

export function rememberAuthReturnTo(returnTo = currentLocationPath()) {
  sessionStorage.setItem(AUTH_RETURN_TO_KEY, normalizeAuthReturnTo(returnTo));
}

export function getAuthReturnTo() {
  return normalizeAuthReturnTo(sessionStorage.getItem(AUTH_RETURN_TO_KEY));
}

export function consumeAuthReturnTo() {
  const returnTo = getAuthReturnTo();
  sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  return returnTo;
}

export function clearAuthReturnTo() {
  sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
}

export function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export const authStorage = {
  getToken: () => localStorage.getItem('token') || localStorage.getItem('auth_token'),
  setToken: (token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('auth_token', token);
    localStorage.removeItem(AUTH_LOGGED_OUT_KEY);
    localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
  },
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setRefreshToken: (token: string) => localStorage.setItem('refresh_token', token),
  isLoggedOut: () => localStorage.getItem(AUTH_LOGGED_OUT_KEY) === '1',
  hasSessionHint: () => Boolean(
    localStorage.getItem('token')
    || localStorage.getItem('auth_token')
    || localStorage.getItem(AUTH_SESSION_HINT_KEY) === '1'
    || sessionStorage.getItem('auth_user'),
  ),
  markAuthenticated: () => {
    localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
    localStorage.removeItem(AUTH_LOGGED_OUT_KEY);
  },
  markLoggedOut: () => localStorage.setItem(AUTH_LOGGED_OUT_KEY, '1'),
  clearLoggedOut: () => localStorage.removeItem(AUTH_LOGGED_OUT_KEY),
  clear: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
  },
};

export const githubLoginUrl = `${API_BASE}auth/github/login`;

// OAuth must use a top-level browser navigation so the backend can redirect to GitHub.
export function startGithubLogin() {
  rememberAuthReturnTo();
  window.location.href = githubLoginUrl;
}

export async function logout() {
  const refreshToken = authStorage.getRefreshToken();
  try {
    await fetch(`${API_BASE}auth/logout`, {
      method: 'POST',
      headers: refreshToken ? { 'Content-Type': 'application/json' } : undefined,
      body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
    });
  } finally {
    authStorage.clear();
    authStorage.markLoggedOut();
    sessionStorage.removeItem('auth_user');
  }
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
