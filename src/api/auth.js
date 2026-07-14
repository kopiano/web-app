import request from './request'

export function register(data) {
  return request.post('/auth/register', data)
}

export function login(data) {
  return request.post('/auth/login', data)
}

export function logout() {
  return request.post('/auth/logout')
}

export function gitGithubLogin() {
    const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8100/api/')
        .replace(/\/?$/, '/')
    window.location.href = `${apiUrl}auth/github/login`
}

export function refresh() {
  return request.post('/auth/refresh')
}
