import client from './client'

// Filed from the Receiving checklist when a delivery comes up short or with
// extra, unordered items. Compiled on the Discrepancies page (grouped by
// vendor) so an Inventory Lead or admin can chase a refund/credit.
export const listDiscrepancies = (params = {}) => client.get('/orders/discrepancies.php', { params }).then((r) => r.data)
export const createDiscrepancyReport = (payload) => client.post('/orders/discrepancies.php', payload).then((r) => r.data)
export const resolveDiscrepancy = (id, resolution_notes) =>
  client.put(`/orders/discrepancy.php?id=${id}`, { status: 'resolved', resolution_notes }).then((r) => r.data)
export const reopenDiscrepancy = (id) =>
  client.put(`/orders/discrepancy.php?id=${id}`, { status: 'open' }).then((r) => r.data)
