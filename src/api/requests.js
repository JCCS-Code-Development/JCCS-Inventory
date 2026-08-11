import client from './client'

// "I need this ordered" tickets — a basic user only ever gets back their
// own; the shared queue is specialist/admin only (enforced server-side).
export const listRequests = (params = {}) => client.get('/requests/index.php', { params }).then((r) => r.data)
export const createRequest = (payload) => client.post('/requests/index.php', payload).then((r) => r.data)
export const resolveRequest = (id, payload) => client.patch(`/requests/item.php?id=${id}`, payload).then((r) => r.data)
export const deleteRequest = (id) => client.delete(`/requests/item.php?id=${id}`).then((r) => r.data)
