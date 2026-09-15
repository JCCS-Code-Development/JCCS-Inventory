import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import StatsCard from '../components/admin/StatsCard'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Tag from '../components/ui/Tag'
import Spinner from '../components/ui/Spinner'
import TaskDetailModal from '../components/tasks/TaskDetailModal'
import { listItems } from '../api/items'
import { listLocations } from '../api/locations'
import { getLowStockReport } from '../api/reports'
import { listOrders } from '../api/orders'
import { listTasks } from '../api/tasks'
import { listTools } from '../api/tools'
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
const STATUS_BADGE = {
  to_do: 'active', in_progress: 'checkout', waiting_approval: 'partially_received',
  waiting_delivery: 'partially_received', blocked: 'low_stock', completed: 'in_stock', canceled: 'cancelled',
}

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

// One compact, clickable row — used by every task section below. Keeps the
// list scannable (title + the couple of tags that matter) rather than
// repeating the full detail every row; the modal has the rest.
function TaskRow({ task, onOpen }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={() => onOpen(task.id)}
      className="w-full flex items-start justify-between gap-3 py-2.5 text-left hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {task.priority === 'high' && <Tag tone="blue">{t('tasks.priorityHigh')}</Tag>}
          {task.location_name && <Tag>{task.location_name}</Tag>}
          {task.item_sku && <Tag>{task.item_sku}</Tag>}
          {task.checklist_total > 0 && <Tag>{task.checklist_done}/{task.checklist_total}</Tag>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <Badge variant={STATUS_BADGE[task.status]}>{t(`tasks.status.${task.status}`)}</Badge>
        {task.due_at && <p className="text-xs text-gray-400 mt-1">{formatDate(task.due_at)}</p>}
      </div>
    </button>
  )
}

function TaskSection({ title, tasks, onOpen, emptyText, defaultOpen = true, accent }) {
  if (tasks.length === 0 && !emptyText) return null
  return (
    <details open={defaultOpen} className="group bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <summary className={`cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-3 flex items-center justify-between text-sm font-semibold ${accent ?? 'bg-gray-50 text-gray-700'}`}>
        <span className="flex items-center gap-2">
          <span className="text-gray-400 inline-block transition-transform group-open:rotate-90">▸</span>
          {title}
        </span>
        {tasks.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold bg-white/70 text-gray-600">
            {tasks.length}
          </span>
        )}
      </summary>
      <div className="border-t border-gray-100 px-2 py-1 divide-y divide-gray-50">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">{emptyText}</p>
        ) : (
          tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={onOpen} />)
        )}
      </div>
    </details>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'admin' || role === 'specialist'
  const STATUS_LABELS = { placed: t('orders.status.placed'), partially_received: t('orders.status.partiallyReceived') }

  const [loading, setLoading]             = useState(true)
  const [itemCount, setItemCount]         = useState(0)
  const [locationCount, setLocationCount] = useState(0)
  const [lowStock, setLowStock]           = useState([])
  const [openOrders, setOpenOrders]       = useState([])
  const [tasks, setTasks]                 = useState([])
  const [tools, setTools]                 = useState([])
  const [openTaskId, setOpenTaskId]       = useState(null)

  const load = () => {
    Promise.all([
      listItems({ active: 1 }),
      listLocations({ active: 1 }),
      getLowStockReport(),
      canManage ? listOrders() : Promise.resolve({ orders: [] }),
      listTasks(),
      listTools(),
    ]).then(([items, locations, low, orders, taskData, toolData]) => {
      setItemCount(items.items?.length ?? 0)
      setLocationCount(locations.locations?.length ?? 0)
      setLowStock(low.items ?? [])
      setOpenOrders((orders.orders ?? []).filter(o => OPEN_STATUSES.includes(o.status)))
      setTasks(taskData.tasks ?? [])
      setTools(toolData.tools ?? [])
    }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [canManage]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  // ── Bucket every task into exactly one dashboard section ────────────────
  // Order matters: a status bucket always wins over a date bucket, so a
  // waiting/blocked task never also shows up as merely "overdue."
  const todayStr = new Date().toISOString().slice(0, 10)
  const recentCutoff = Date.now() - 7 * 86400000

  const buckets = { overdue: [], today: [], next7: [], waitingApproval: [], waitingDelivery: [], improvement: [], completed: [] }
  for (const task of tasks) {
    if (task.status === 'canceled') continue
    if (task.status === 'completed') {
      if (task.completed_at && new Date(task.completed_at).getTime() >= recentCutoff) buckets.completed.push(task)
      continue
    }
    if (task.status === 'waiting_approval') { buckets.waitingApproval.push(task); continue }
    if (task.status === 'waiting_delivery') { buckets.waitingDelivery.push(task); continue }
    if (task.source === 'improvement' && !task.assigned_to) { buckets.improvement.push(task); continue }

    const dueDate = task.due_at ? task.due_at.slice(0, 10) : null
    if (dueDate && dueDate < todayStr) buckets.overdue.push(task)
    else if (!dueDate || dueDate === todayStr) buckets.today.push(task)
    else buckets.next7.push(task) // due later — including >7 days out, folded in here rather than a separate bucket
  }
  buckets.completed.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))

  const missingTools = tools.filter(tl => tl.is_overdue)

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

      {/* ── The daily work queue — most urgent first ──────────────────── */}
      <div className="flex flex-col gap-3 mb-6">
        <TaskSection title={t('dashboard.overdue')} tasks={buckets.overdue} onOpen={setOpenTaskId} accent="bg-red-50 text-red-700" />
        <TaskSection title={t('dashboard.today')} tasks={buckets.today} onOpen={setOpenTaskId} emptyText={t('dashboard.nothingToday')} />
        <TaskSection title={t('dashboard.waitingForApproval')} tasks={buckets.waitingApproval} onOpen={setOpenTaskId} accent="bg-amber-50 text-amber-700" />
        <TaskSection title={t('dashboard.waitingForDelivery')} tasks={buckets.waitingDelivery} onOpen={setOpenTaskId} accent="bg-amber-50 text-amber-700" />
        <TaskSection title={t('dashboard.nextSevenDays')} tasks={buckets.next7} onOpen={setOpenTaskId} defaultOpen={false} />
        <TaskSection title={t('dashboard.improvementTasks')} tasks={buckets.improvement} onOpen={setOpenTaskId}
          emptyText={t('dashboard.noImprovementTasks')} defaultOpen={false} />

        {missingTools.length > 0 && (
          <details className="group bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-3 bg-red-50 text-red-700 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2">
                <span className="text-gray-400 inline-block transition-transform group-open:rotate-90">▸</span>
                {t('dashboard.overdueTools')}
              </span>
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold bg-white/70 text-gray-600">{missingTools.length}</span>
            </summary>
            <div className="border-t border-gray-100 flex flex-col divide-y divide-gray-50 px-2">
              {missingTools.map((tl) => (
                <Link key={tl.item_id} to="/tools" className="flex items-center justify-between py-2.5 px-2 hover:bg-gray-50 rounded-lg -mx-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tl.name}</p>
                    <p className="text-xs text-gray-400">{t('tools.assignedTo', { name: tl.assigned_to_name ?? '—' })}</p>
                  </div>
                  <Badge variant="low_stock">{t('tools.overdue')}</Badge>
                </Link>
              ))}
            </div>
          </details>
        )}

        <TaskSection title={t('dashboard.recentlyCompleted')} tasks={buckets.completed} onOpen={setOpenTaskId} defaultOpen={false} />
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

      {openTaskId && (
        <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={load} />
      )}
    </div>
  )
}
