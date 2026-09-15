import client from './client'

// Recurring/improvement task definitions — Lead/admin only. api/cron/
// generate-tasks.php reads these on a schedule to materialize real tasks.
export const listTaskTemplates = () => client.get('/task-templates/index.php').then((r) => r.data)
export const createTaskTemplate = (payload) => client.post('/task-templates/index.php', payload).then((r) => r.data)
export const updateTaskTemplate = (id, payload) => client.put(`/task-templates/item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateTaskTemplate = (id) => client.delete(`/task-templates/item.php?id=${id}`).then((r) => r.data)
