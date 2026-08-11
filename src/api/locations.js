import client from './client'

export const listLocations = (params = {}) => client.get('/locations/index.php', { params }).then((r) => r.data)
export const createLocation = (payload) => client.post('/locations/index.php', payload).then((r) => r.data)
export const updateLocation = (id, payload) => client.put(`/locations/item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateLocation = (id) => client.delete(`/locations/item.php?id=${id}`).then((r) => r.data)
