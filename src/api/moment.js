import request from './request'

let listRequest = null

export function getMoments() {
  if (listRequest) return listRequest

  listRequest = request.get('/moment').then(response => {
    if (Array.isArray(response.data)) return response.data
    throw new Error('Invalid moments response')
  }).finally(() => {
    listRequest = null
  })

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
