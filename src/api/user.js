import request from './request'

export function getMe() {
    return request.get('/users/me')
}

export function getUserList() {
  return request.get('/users')
}

export function updateProfile(data) {
  return request.put('/user/profile', data)
}
