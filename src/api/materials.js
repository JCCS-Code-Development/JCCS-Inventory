import client from './client'

export const listMaterials = (categoryId) =>
  client.get('/materials/index.php', { params: { category_id: categoryId } }).then((r) => r.data)
export const createMaterial = (payload) => client.post('/materials/index.php', payload).then((r) => r.data)
export const updateMaterial = (id, payload) => client.put(`/materials/item.php?id=${id}`, payload).then((r) => r.data)
export const deleteMaterial = (id) => client.delete(`/materials/item.php?id=${id}`).then((r) => r.data)
