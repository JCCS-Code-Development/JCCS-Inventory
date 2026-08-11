import client from './client'

export const listCategories = () => client.get('/categories/index.php').then((r) => r.data)
export const createCategory = (payload) => client.post('/categories/index.php', payload).then((r) => r.data)
export const updateCategory = (id, payload) => client.put(`/categories/item.php?id=${id}`, payload).then((r) => r.data)
export const deleteCategory = (id) => client.delete(`/categories/item.php?id=${id}`).then((r) => r.data)
