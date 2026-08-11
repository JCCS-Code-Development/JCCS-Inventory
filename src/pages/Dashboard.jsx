import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import StatsCard from '../components/admin/StatsCard'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { listItems } from '../api/items'
import { listLocations } from '../api/locations'
import { getLowStockReport } from '../api/reports'
import { listOrders } from '../api/orders'
import { useAuthStore } from '../store/authStore'
import { formatDate, formatQty } from '../utils/format'

const ItemsGlyph    = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
const AlertGlyph    = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
const LocationsGlyph= () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
const OrdersGlyph   = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/><path strokeLinecap="round" strokeLinejoin="round" d="M20 16.5V7.5a2 2 0 00-1-1.73l-6-3.46a2 2 0 00-2 0l-6 3.46a2 2 0 00-1 1.73v9a2 2 0 001 1.73l6 3.46a2 2 0 002 0l6-3.46a2 2 0 001-1.73z"/></svg>
const PlusGlyph     = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
const SearchGlyph   = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>
const TakeGlyph     = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>

const OPEN_STATUSES = ['placed', 'partially_received']

// Soft pastel tones per action — background stays pale so it doesn't fight
// with the brand-orange chrome elsewhere on the page; hover/active just
// deepen the same hue slightly rather than introducing a new color.
const QUICK_ACTION_TONES = {
  green:  'bg-green-50  border-green-100  text-green-800  hover:bg-green-100  hover:border-green-200',
  yellow: 'bg-amber-50  border-amber-100  text-amber-800  hover:bg-amber-100  hover:border-amber-200',
  red:    'bg-red-50    border-red-100    text-red-800    hover:bg-red-100    hover:border-red-200',
}

function QuickAction({ icon, label, to, state, tone }) {
  return (
    <Link to={to} state={state}
      className={`flex-1 min-w-[9rem] flex items-center justify-center gap-2 border rounded-2xl px-4 py-3.5 font-semibold text-sm transition-colors ${QUICK_ACTION_TONES[tone]}`}>
      {icon}{label}
    </Link>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'admin' || role === 'specialist'
  const STATUS_LABELS = { placed: t('orders.status.placed'), partially_received: t('orders.status.partiallyReceived') }

  const [loading, setLoading]         = useState(true)
  const [itemCount, setItemCount]     = useState(0)
  const [locationCount, setLocationCount] = useState(0)
  const [lowStock, setLowStock]       = useState([])
  const [openOrders, setOpenOrders]   = useState([])

  useEffect(() => {
    Promise.all([
      listItems({ active: 1 }),
      listLocations({ active: 1 }),
      getLowStockReport(),
      canManage ? listOrders() : Promise.resolve({ orders: [] }),
    ]).then(([items, locations, low, orders]) => {
      setItemCount(items.items?.length ?? 0)
      setLocationCount(locations.locations?.length ?? 0)
      setLowStock(low.items ?? [])
      setOpenOrders((orders.orders ?? []).filter(o => OPEN_STATUSES.includes(o.status)))
    }).finally(() => setLoading(false))
  }, [canManage])

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="w-full">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      {/* ── Quick actions ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-6">
        {canManage && (
          <QuickAction icon={<PlusGlyph />} label={t('dashboard.registerItem')} to="/items" state={{ openCreate: true }} tone="green" />
        )}
        <QuickAction icon={<SearchGlyph />} label={t('dashboard.searchItem')} to="/items" state={{ focusSearch: true }} tone="yellow" />
        <QuickAction icon={<TakeGlyph />} label={t('dashboard.takeItem')} to="/take-dropoff" state={{ tab: 'take' }} tone="red" />
      </div>

      <div className={`grid grid-cols-1 ${canManage ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-4 mb-6`}>
        <StatsCard label={t('dashboard.activeItems')} value={itemCount} icon={<ItemsGlyph />} color="brand" />
        <StatsCard label={t('dashboard.lowStock')} value={lowStock.length} icon={<AlertGlyph />} color="amber" />
        <StatsCard label={t('dashboard.locations')} value={locationCount} icon={<LocationsGlyph />} color="brand" />
        {canManage && <StatsCard label={t('dashboard.ordersAwaiting')} value={openOrders.length} icon={<OrdersGlyph />} color="brand" />}
      </div>

      <div className={`grid grid-cols-1 ${canManage ? 'lg:grid-cols-2' : ''} gap-4`}>
        <Card title={t('dashboard.lowStock')} action={canManage && <Link to="/reports" className="text-sm font-semibold text-brand-500">{t('dashboard.viewReport')}</Link>}>
          {lowStock.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t('dashboard.nothingBelowReorder')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {lowStock.slice(0, 6).map((row) => (
                <div key={`${row.item_id}-${row.location_id}`} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{row.name}</p>
                    <p className="text-xs text-gray-400">{row.location_name}</p>
                  </div>
                  <Badge variant="low_stock">{formatQty(row.qty_on_hand, row.unit_of_measure)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {canManage && (
          <Card title={t('dashboard.ordersAwaitingReceipt')} action={<Link to="/orders" className="text-sm font-semibold text-brand-500">{t('dashboard.viewAll')}</Link>}>
            {openOrders.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">{t('dashboard.nothingOnOrder')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-100">
                {openOrders.slice(0, 6).map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{o.order_number || t('dashboard.orderNumberFallback', { id: o.id })}</p>
                      <p className="text-xs text-gray-400">
                        {o.vendor_name ?? t('dashboard.noVendor')} · {o.expected_date ? t('dashboard.expectedOn', { date: formatDate(o.expected_date) }) : t('dashboard.noDateSet')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={o.status}>{STATUS_LABELS[o.status]}</Badge>
                      <p className="text-xs text-gray-500 mt-1">{o.qty_received_total} / {o.qty_ordered_total}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
