import client from './client'

export const listUsers = () => client.get('/users/index.php').then((r) => r.data)
export const createUser = (payload) => client.post('/users/index.php', payload).then((r) => r.data)
export const updateUser = (id, payload) => client.put(`/users/item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateUser = (id) => client.delete(`/users/item.php?id=${id}`).then((r) => r.data)
