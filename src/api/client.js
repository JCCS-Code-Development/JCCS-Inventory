import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { refresh as fieldclockRefresh } from './fieldclockAuth'

// Talks to Inventory's own API. Every request carries the JWT that was
// issued by FieldClock at login time — Inventory's backend verifies that
// token itself (shared JWT_SECRET) rather than looking it up in a shared
// database.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Queue for concurrent requests that fail while a refresh is in flight
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => (error ? prom.reject(error) : prom.resolve(token)))
  failedQueue = []
}

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return client(original)
      })
    }
    original._retry = true
    isRefreshing = true
    const { refreshToken, updateToken, logout } = useAuthStore.getState()
    try {
      // Refresh happens against FieldClock (the token issuer), not Inventory's own API.
      const data = await fieldclockRefresh(refreshToken)
      updateToken(data.token, data.refreshToken ?? undefined)
      processQueue(null, data.token)
      original.headers.Authorization = `Bearer ${data.token}`
      return client(original)
    } catch (err) {
      processQueue(err, null)
      logout()
      window.location.replace('/login')
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)

export default client
