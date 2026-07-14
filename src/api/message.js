import request from './request'

export function getMessageUserInfo() {
  return request.get('/message/user_info')
}
