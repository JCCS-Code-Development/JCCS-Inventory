import client from './client'

// "I need this ordered" tickets — a basic user only ever gets back their
// own; the shared queue is specialist/admin only (enforced server-side).
export const listRequests = (params = {}) => client.get('/requests/index.php', { params }).then((r) => r.data)
export const createRequest = (payload) => client.post('/requests/index.php', payload).then((r) => r.data)
export const resolveRequest = (id, payload) => client.patch(`/requests/item.php?id=${id}`, payload).then((r) => r.data)
// Lead-only: sets/updates the reviewed project + product link without
// touching status — the "sat down and went over it together" step, which
// can happen before (or without) the ticket ever being marked ordered.
export const updateRequestReview = (id, payload) => client.patch(`/requests/item.php?id=${id}`, payload).then((r) => r.data)
// Undo a decline — puts the ticket back to 'open'. Only valid on an
// already-declined request (enforced server-side).
export const undoDeclineRequest = (id) => client.patch(`/requests/item.php?id=${id}`, { status: 'open' }).then((r) => r.data)
export const deleteRequest = (id) => client.delete(`/requests/item.php?id=${id}`).then((r) => r.data)

// Title/description/image for a pasted product link (Open Graph, falling
// back to <title>) — Lead-only, same as the product link field itself.
export const getLinkPreview = (url) => client.get('/requests/link-preview.php', { params: { url } }).then((r) => r.data)

// The "Ready to Order" worklist — reviewed (project and/or product link set)
// requests still open — as a CSV, for the Mon/Wed/Fri session with the other
// Inventory Lead.
export const downloadReadyToOrderCsv = async () => {
  const res = await client.get('/requests/ready.csv.php', { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'ready-to-order-report.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
