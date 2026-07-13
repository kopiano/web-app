const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8100';

export const authStorage = {
  getToken: () => localStorage.getItem('auth_token'),
  setToken: (token: string) => localStorage.setItem('auth_token', token),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setRefreshToken: (token: string) => localStorage.setItem('refresh_token', token),
  clear: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
  },
};

export const githubLoginUrl = `${API_BASE}/api/auth/github/login`;

export async function logout() {
  const refreshToken = authStorage.getRefreshToken();
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: refreshToken ? { 'X-Refresh-Token': refreshToken } : undefined,
  });
  authStorage.clear();
}

export async function refreshToken() {
  const refresh = authStorage.getRefreshToken();
  if (!refresh) return false;
  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!response.ok) {
    authStorage.clear();
    return false;
  }
  const data = await response.json() as { token: string };
  authStorage.setToken(data.token);
  return true;
}

export async function getCurrentUser() {
  const token = authStorage.getToken();
  return fetch(`${API_BASE}/api/user/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}
