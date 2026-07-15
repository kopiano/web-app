import axios from 'axios'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  withCredentials: true,  // 允许浏览器携带跨域 Cookie。
})

request.interceptors.response.use((response) => {
  const body = response.data
  if (
    !body ||
    typeof body !== 'object' ||
    body.code !== 200 ||
    !Object.prototype.hasOwnProperty.call(body, 'message') ||
    !Object.prototype.hasOwnProperty.call(body, 'data')
  ) {
    return Promise.reject(new Error('Invalid API response format'))
  }
  response.data = body.data
  return response
})

export default request
