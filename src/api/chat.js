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

export function sendImageMessage(input) {
  const formData = new FormData()
  formData.append('chat_type', input.chat_type)
  if (input.receiver_id) formData.append('receiver_id', input.receiver_id)
  if (input.group_id) formData.append('group_id', input.group_id)
  formData.append('client_message_id', input.client_message_id)
  formData.append('image', input.image, input.image.name)

  return request.post('/message/image', formData).then(response => {
    if (response.data && typeof response.data === 'object' && typeof response.data.id === 'number') {
      return response.data
    }
    throw new Error('Invalid image message response')
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
