import request from './request'
import { authStorage } from '../lib/auth'

export function register(data) {
  return request.post('/auth/register', data)
}

export function login(data) {
  return request.post('/auth/login', data)
}

export async function logout() {
  const refreshToken = authStorage.getRefreshToken()

  try {
    return await request.post(
      '/auth/logout',
      refreshToken ? { refresh_token: refreshToken } : undefined,
    )
  } finally {
    authStorage.clear()
    authStorage.markLoggedOut()
    sessionStorage.removeItem('auth_user')
  }
}

export function gitGithubLogin() {
    const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8100/api/')
        .replace(/\/?$/, '/')
    window.location.href = `${apiUrl}auth/github/login`
}

export function refresh() {
  return request.post('/auth/refresh')
}
