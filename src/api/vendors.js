import client from './client'

export const listVendors = (params = {}) => client.get('/vendors/index.php', { params }).then((r) => r.data)
export const createVendor = (payload) => client.post('/vendors/index.php', payload).then((r) => r.data)
export const updateVendor = (id, payload) => client.put(`/vendors/item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateVendor = (id) => client.delete(`/vendors/item.php?id=${id}`).then((r) => r.data)
