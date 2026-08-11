import client from './client'

export const listItems = (params = {}) => client.get('/items/index.php', { params }).then((r) => r.data)
export const createItem = (payload) => client.post('/items/index.php', payload).then((r) => r.data)
export const updateItem = (id, payload) => client.put(`/items/item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateItem = (id) => client.delete(`/items/item.php?id=${id}`).then((r) => r.data)
export const lookupItemByBarcode = (barcode) => client.get('/items/lookup.php', { params: { barcode } }).then((r) => r.data)

// An item can have more than one barcode (unit vs. box vs. pallet).
export const listItemBarcodes = (itemId) => client.get('/items/barcodes.php', { params: { item_id: itemId } }).then((r) => r.data)
export const addItemBarcode = (payload) => client.post('/items/barcodes.php', payload).then((r) => r.data)
export const removeItemBarcode = (id) => client.delete(`/items/barcodes.php?id=${id}`).then((r) => r.data)

// Reference photo, editable by specialist/admin. `imageBlob` is already
// compressed client-side (see utils/compressImage.js) before it gets here.
export const uploadItemImage = (itemId, imageBlob) => {
  const form = new FormData()
  form.append('item_id', itemId)
  form.append('image', imageBlob, 'photo.jpg')
  // The client's default Content-Type (application/json) has to be cleared
  // here so the browser sets multipart/form-data with the correct boundary
  // itself — a fixed default header would otherwise take precedence.
  return client.post('/items/image.php', form, { headers: { 'Content-Type': undefined } }).then((r) => r.data)
}
export const deleteItemImage = (itemId) => client.delete(`/items/image.php?item_id=${itemId}`).then((r) => r.data)
