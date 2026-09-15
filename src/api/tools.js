import client from './client'

// Trackable assets (tools) — items.is_trackable_asset — and their checkout
// lifecycle. A basic user's list is server-filtered to their own current
// checkout + unassigned tools (see api/tools/index.php).
export const listTools = () => client.get('/tools/index.php').then((r) => r.data)
export const checkoutTool = (payload) => client.post('/tools/checkout.php', payload).then((r) => r.data)
export const checkinTool = (payload) => client.post('/tools/checkin.php', payload).then((r) => r.data)
