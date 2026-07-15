import request from './request'

export function getMessageUserInfo() {
  return request.get('/message/user_info').then(response => {
    if (Array.isArray(response.data)) return response.data
    throw new Error('Invalid contacts response')
  })
}
