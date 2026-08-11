import axios from 'axios'

// A separate client pointed at FieldClock's live API — Inventory has no
// login of its own. It authenticates users through FieldClock's existing
// identifier+password login and reuses the JWT that comes back.
const fieldclockClient = axios.create({
  baseURL: import.meta.env.VITE_FIELDCLOCK_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

export const login = (identifier, password) =>
  fieldclockClient.post('/auth/login.php', { identifier, password }).then((r) => r.data)

export const refresh = (refreshToken) =>
  fieldclockClient.post('/auth/refresh.php', { refreshToken }).then((r) => r.data)

export const logout = (refreshToken) =>
  fieldclockClient.post('/auth/logout.php', { refreshToken }).then((r) => r.data)
