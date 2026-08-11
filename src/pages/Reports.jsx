import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import {
  getStockReport, getLowStockReport, getProjectUsageReport, getReorderPlanningReport,
  downloadStockCsv, downloadLowStockCsv, downloadProjectUsageCsv,
} from '../api/reports'
import { formatCurrency } from '../utils/format'

export default function Reports() {
  const { t } = useTranslation()
  const [tab, setTab]         = useState('stock')
  const [stock, setStock]     = useState([])
  const [lowStock, setLowStock] = useState([])
  const [projectUsage, setProjectUsage] = useState({ lines: [], totals: [] })
  const [reorderPlanning, setReorderPlanning] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getStockReport(), getLowStockReport(), getProjectUsageReport(), getReorderPlanningReport()])
      .then(([s, l, p, r]) => { setStock(s.items ?? []); setLowStock(l.items ?? []); setProjectUsage(p); setReorderPlanning(r.items ?? []) })
      .finally(() => setLoading(false))
  }, [])

  const rows = tab === 'stock' ? stock : tab === 'low' ? lowStock : []

  const exportCsv = () => {
    if (tab === 'stock') downloadStockCsv()
    else if (tab === 'low') downloadLowStockCsv()
    else if (tab === 'project') downloadProjectUsageCsv()
  }

  return (
    <div className="w-full">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={tab !== 'reorder' && <Button variant="secondary" onClick={exportCsv}>{t('reports.exportCsv')}</Button>}
      />

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {[['stock', t('reports.currentStock')], ['low', t('reports.lowStock')], ['reorder', t('reports.reorderPlanning')], ['project', t('reports.byProject')]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : tab === 'project' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_1fr] gap-6 items-start">
          <Card title={t('reports.totalByProject')}>
            {projectUsage.totals.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">{t('reports.noProjectActivity')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-100">
                {projectUsage.totals.map(tt => (
                  <div key={tt.project_id} className="flex items-center justify-between py-2.5">
                    <p className="text-sm font-medium text-gray-900">{tt.project_name}</p>
                    <p className="text-sm font-semibold text-gray-700">{formatCurrency(tt.total_cost)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title={t('reports.detailByItem')}>
            {projectUsage.lines.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">{t('reports.nothingToShow')}</p>
            ) : (
              <div className="overflow-x-auto -mx-5 -mb-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {[t('items.project'), t('common.item'), t('reports.qtyUsed'), t('items.unitCost'), t('reports.totalCost')].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {projectUsage.lines.map((l) => (
                      <tr key={`${l.project_id}-${l.item_id}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">{l.project_name}</td>
                        <td className="px-4 py-3 text-gray-600">{l.sku} — {l.item_name}</td>
                        <td className="px-4 py-3 text-gray-600">{l.net_qty_used} {l.unit_of_measure}</td>
                        <td className="px-4 py-3 text-gray-600">{formatCurrency(l.unit_cost)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(l.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : tab === 'reorder' ? (
        <Card>
          <p className="text-xs text-gray-500 px-1 pb-3">
            {t('reports.reorderHint')}
          </p>
          {reorderPlanning.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">{t('reports.noReorderPointsSet')}</p>
          ) : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('common.sku'), t('common.name'), t('common.vendor'), t('reports.currentStockCol'), t('items.reorderPt'), t('reports.leadTime'), t('reports.status')].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reorderPlanning.map((r) => (
                    <tr key={r.item_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3 text-gray-600">{r.vendor_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.total_qty} {r.unit_of_measure}</td>
                      <td className="px-4 py-3 text-gray-600">{r.reorder_point}</td>
                      <td className="px-4 py-3 text-gray-600">{r.lead_time_days != null ? t('reports.leadTimeDaysValue', { count: r.lead_time_days }) : '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={r.status === 'low' ? 'low_stock' : 'in_stock'}>{r.status === 'low' ? t('reports.reorderNow') : t('reports.ok')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          {rows.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">
              {tab === 'stock' ? t('reports.noStockRecorded') : t('dashboard.nothingBelowReorder')}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('common.sku'), t('common.name'), t('common.location'), t('reports.qtyOnHand'), t('items.reorderPt'), t('items.unitCost'), t('reports.value')].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={`${r.item_id}-${r.location_id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3 text-gray-600">{r.location_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={r.qty_on_hand <= 0 ? 'out_of_stock' : r.qty_on_hand < r.reorder_point ? 'low_stock' : 'in_stock'}>
                          {r.qty_on_hand} {r.unit_of_measure}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.reorder_point}</td>
                      <td className="px-4 py-3 text-gray-600">{formatCurrency(r.unit_cost)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatCurrency(r.unit_cost * r.qty_on_hand)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
