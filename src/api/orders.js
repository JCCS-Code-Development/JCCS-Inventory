import client from './client'

export const listOrders = (params = {}) => client.get('/orders/index.php', { params }).then((r) => r.data)
export const getOrder = (id) => client.get(`/orders/item.php?id=${id}`).then((r) => r.data)
export const createOrder = (payload) => client.post('/orders/index.php', payload).then((r) => r.data)
export const updateOrder = (id, payload) => client.put(`/orders/item.php?id=${id}`, payload).then((r) => r.data)

// "Item Setup" stage — vet each order line's catalog item before the order
// can be received. confirmOrderItem promotes the order to 'placed' once every
// line is confirmed; setOrderLineItem repoints a line to a different existing
// item (for when the review-time item turns out to be a duplicate).
export const confirmOrderItem = (orderItemId) =>
  client.post('/orders/confirm-item.php', { order_item_id: orderItemId }).then((r) => r.data)
export const unconfirmOrderItem = (orderItemId) =>
  client.post('/orders/confirm-item.php', { order_item_id: orderItemId, undo: true }).then((r) => r.data)
export const setOrderLineItem = (orderItemId, itemId) =>
  client.patch('/orders/line.php', { order_item_id: orderItemId, item_id: itemId }).then((r) => r.data)
export const deleteOrder = (id) => client.delete(`/orders/item.php?id=${id}`).then((r) => r.data)
// Marks a partially received order as done even though it never reached
// full quantity — for when nothing more is actually coming (a vendor credit
// instead of a backorder, etc). Only valid from partially_received with no
// open discrepancy left on it.
export const closeOrder = (id) => client.post(`/orders/close.php?id=${id}`).then((r) => r.data)

// The permanent record — a photo of a receipt or an invoice PDF. Uploaded
// only after the order itself exists (same deferred-upload pattern as item
// reference photos).
export const uploadOrderAttachment = (orderId, file) => {
  const form = new FormData()
  form.append('order_id', orderId)
  form.append('file', file, file.name || 'attachment')
  // Clearing the default Content-Type lets the browser set multipart/form-data
  // with the correct boundary itself.
  return client.post('/orders/attachment.php', form, { headers: { 'Content-Type': undefined } }).then((r) => r.data)
}
export const deleteOrderAttachment = (orderId) => client.delete(`/orders/attachment.php?order_id=${orderId}`).then((r) => r.data)
