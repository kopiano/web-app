import axios from 'axios'

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8100/api/')
  .replace(/\/?$/, '/')

const request = axios.create({
  baseURL: apiUrl,
  timeout: 10000,
  withCredentials: true,  // 允许浏览器携带跨域 Cookie。
})

export default request
