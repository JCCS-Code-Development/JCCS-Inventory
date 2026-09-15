import client from './client'

// Manager-configurable alert conditions — which events email who. Sending
// itself is a follow-on phase (see api/cron/generate-tasks.php); this is
// just the on/off + recipient configuration.
export const listNotificationRules = () => client.get('/notifications/rules.php').then((r) => r.data)
export const createNotificationRule = (payload) => client.post('/notifications/rules.php', payload).then((r) => r.data)
export const updateNotificationRule = (id, payload) => client.put(`/notifications/rules.php?id=${id}`, payload).then((r) => r.data)
