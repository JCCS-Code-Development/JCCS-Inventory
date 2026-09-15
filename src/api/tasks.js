import client from './client'

// The daily work queue behind the dashboard. A basic user's list is
// server-filtered to their own assignments + the unclaimed pool — see
// api/tasks/index.php.
export const listTasks = (params = {}) => client.get('/tasks/index.php', { params }).then((r) => r.data)
export const getTask = (id) => client.get(`/tasks/item.php?id=${id}`).then((r) => r.data)
export const createTask = (payload) => client.post('/tasks/index.php', payload).then((r) => r.data)
export const updateTask = (id, payload) => client.patch(`/tasks/item.php?id=${id}`, payload).then((r) => r.data)

// Convenience wrappers over the same PATCH endpoint for the common actions.
export const claimTask = (id) => updateTask(id, { claim: true })
export const assignTask = (id, assignedTo) => updateTask(id, { assigned_to: assignedTo })
export const toggleChecklistItem = (id, checklistItemId, isChecked) =>
  updateTask(id, { checklist_item_id: checklistItemId, is_checked: isChecked })
export const setTaskStatus = (id, status, extra = {}) => updateTask(id, { status, ...extra })

export const uploadTaskPhoto = (taskId, file) => {
  const form = new FormData()
  form.append('task_id', taskId)
  form.append('photo', file, file.name || 'photo.jpg')
  return client.post('/tasks/attachment.php', form, { headers: { 'Content-Type': undefined } }).then((r) => r.data)
}
export const deleteTaskAttachment = (attachmentId) => client.delete(`/tasks/attachment.php?id=${attachmentId}`).then((r) => r.data)
