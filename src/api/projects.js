import client from './client'

export const listProjects = (params = {}) => client.get('/projects/index.php', { params }).then((r) => r.data)
export const createProject = (payload) => client.post('/projects/index.php', payload).then((r) => r.data)
export const updateProject = (id, payload) => client.put(`/projects/item.php?id=${id}`, payload).then((r) => r.data)
export const deactivateProject = (id) => client.delete(`/projects/item.php?id=${id}`).then((r) => r.data)

// Any role: finds the project with this 4-digit Estimate #, or creates a
// bare-bones one on the spot if it doesn't exist yet.
export const resolveProject = (projectNumber) => client.post('/projects/resolve.php', { project_number: projectNumber }).then((r) => r.data)
