import request from './request'

const historyRequests = new Map()

export function getMessageUserInfo() {
  return request.get('/message/user_info').then(response => {
    if (Array.isArray(response.data)) return response.data
    throw new Error('Invalid contacts response')
  })
}

export function sendMessage(input) {
  return request.post('/message', input).then(response => {
    if (response.data && typeof response.data === 'object' && typeof response.data.id === 'number') {
      return response.data
    }
    throw new Error('Invalid message response')
  })
}

export function getMessageHistory({ chat_type, contact_id, limit = 100 }) {
  const key = `${chat_type}:${contact_id}:${limit}`
  const existingRequest = historyRequests.get(key)
  if (existingRequest) return existingRequest

  const historyRequest = request.get('/message/history', {
    params: { chat_type, contact_id, limit },
  }).then(response => {
    if (Array.isArray(response.data)) return response.data
    throw new Error('Invalid message history response')
  }).finally(() => {
    historyRequests.delete(key)
  })

  historyRequests.set(key, historyRequest)
  return historyRequest
}
