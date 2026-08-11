import client from './client'

export const receiveStock = (payload) => client.post('/stock/receive.php', payload).then((r) => r.data)
export const checkoutStock = (payload) => client.post('/stock/checkout.php', payload).then((r) => r.data)
export const checkinStock = (payload) => client.post('/stock/checkin.php', payload).then((r) => r.data)
// Physical count reconciliation — sets qty_on_hand to what was actually
// counted (ground truth), not additive like receiveStock.
export const submitCount = (payload) => client.post('/stock/count.php', payload).then((r) => r.data)
export const listTransactions = (params = {}) => client.get('/stock/transactions.php', { params }).then((r) => r.data)
export const getCurrentStock = (locationId) =>
  client.get('/stock/current.php', { params: { location_id: locationId } }).then((r) => r.data)
