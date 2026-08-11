import client from './client'

export const getStockReport = (params = {}) => client.get('/reports/stock.php', { params }).then((r) => r.data)
export const getLowStockReport = (params = {}) => client.get('/reports/low-stock.php', { params }).then((r) => r.data)
export const getProjectUsageReport = (params = {}) => client.get('/reports/project-usage.php', { params }).then((r) => r.data)
export const getReorderPlanningReport = (params = {}) => client.get('/reports/reorder-planning.php', { params }).then((r) => r.data)

const download = async (path, params, filename) => {
  const res = await client.get(path, { params, responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const downloadStockCsv = (params = {}) => download('/reports/stock.csv.php', params, 'stock-report.csv')
export const downloadLowStockCsv = (params = {}) => download('/reports/low-stock.csv.php', params, 'low-stock-report.csv')
export const downloadProjectUsageCsv = (params = {}) => download('/reports/project-usage.csv.php', params, 'project-usage-report.csv')
