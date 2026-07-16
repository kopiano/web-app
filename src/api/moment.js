import request from './request'

const listRequests = new Map()

export function getMoments(cursor) {
  const params = cursor
    ? { before_created_at: cursor.createdAt, before_id: cursor.id }
    : {}
  const requestKey = cursor ? `${cursor.createdAt}:${cursor.id}` : 'initial'
  const activeRequest = listRequests.get(requestKey)
  if (activeRequest) return activeRequest

  const listRequest = request.get('/moment', { params }).then(response => {
    if (Array.isArray(response.data)) return response.data
    throw new Error('Invalid moments response')
  }).finally(() => {
    listRequests.delete(requestKey)
  })

  listRequests.set(requestKey, listRequest)
  return listRequest
}

export function getMoment(id) {
  return request.get(`/moment/${encodeURIComponent(id)}`).then(response => {
    if (response.data && typeof response.data === 'object' && response.data.id === id) {
      return response.data
    }
    throw new Error('Invalid moment response')
  })
}

export function createMoment(input) {
  const formData = new FormData()
  let previousLoaded = 0
  let previousTimestamp = performance.now()
  let smoothedRate = 0
  if (input.content.trim()) formData.append('content', input.content.trim())
  if (input.media && input.mediaType) {
    formData.append('media_type', input.mediaType)
    formData.append('media', input.media, input.media.name)
  }

  return request.post('/moment', formData, {
    timeout: 0,
    onUploadProgress: progressEvent => {
      if (!input.onUploadProgress) return

      const timestamp = performance.now()
      const requestTotal = progressEvent.total || input.media?.size || progressEvent.loaded
      const displayTotal = input.media?.size || requestTotal
      const loaded = Math.min(progressEvent.loaded, displayTotal)
      const elapsedSeconds = Math.max((timestamp - previousTimestamp) / 1000, 0.001)
      const transferredBytes = Math.max(0, progressEvent.loaded - previousLoaded)
      const measuredRate = transferredBytes / elapsedSeconds
      const reportedRate = Number(progressEvent.rate) || 0
      const nextRate = reportedRate > 0 ? reportedRate : measuredRate

      if (nextRate > 0) {
        smoothedRate = smoothedRate > 0
          ? (smoothedRate * 0.72) + (nextRate * 0.28)
          : nextRate
      }
      previousLoaded = progressEvent.loaded
      previousTimestamp = timestamp

      const percent = Math.min(100, Math.round(
        (progressEvent.loaded / requestTotal) * 100,
      ))
      input.onUploadProgress({
        percent,
        loaded: percent >= 100 ? displayTotal : loaded,
        total: displayTotal,
        bytesPerSecond: smoothedRate,
        remainingSeconds: percent >= 100 || smoothedRate <= 0
          ? 0
          : Math.ceil((requestTotal - progressEvent.loaded) / smoothedRate),
      })
    },
  }).then(response => {
    if (response.data && typeof response.data === 'object' && typeof response.data.id === 'string') {
      return response.data
    }
    throw new Error('Invalid create moment response')
  })
}

export function deleteMoment(id) {
  return request.delete(`/moment/${encodeURIComponent(id)}`).then(() => undefined)
}

export function likeMoment(id) {
  return request.post(`/moment/${encodeURIComponent(id)}/like`).then(response => {
    if (
      response.data
      && typeof response.data === 'object'
      && response.data.moment_id === id
      && response.data.liked === true
    ) {
      return response.data
    }
    throw new Error('Invalid like moment response')
  })
}

export function unlikeMoment(id) {
  return request.delete(`/moment/${encodeURIComponent(id)}/like`).then(response => {
    if (
      response.data
      && typeof response.data === 'object'
      && response.data.moment_id === id
      && response.data.liked === false
    ) {
      return response.data
    }
    throw new Error('Invalid unlike moment response')
  })
}

export function createMomentComment(id, content) {
  return request.post(`/moment/${encodeURIComponent(id)}/comment`, { content }).then(response => {
    if (
      response.data
      && typeof response.data === 'object'
      && response.data.moment_id === id
      && typeof response.data.id === 'string'
    ) {
      return response.data
    }
    throw new Error('Invalid create moment comment response')
  })
}
