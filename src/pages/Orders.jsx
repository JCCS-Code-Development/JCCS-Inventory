import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import {
  listOrders, getOrder, createOrder, deleteOrder, closeOrder,
  uploadOrderAttachment, deleteOrderAttachment,
} from '../api/orders'
import { listDiscrepancies, resolveDiscrepancy, reopenDiscrepancy } from '../api/discrepancies'
import { resolveRequest } from '../api/requests'
import { listVendors } from '../api/vendors'
import { listItems } from '../api/items'
import { listLocations } from '../api/locations'
import { listUsers } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { useBadgeStore } from '../store/badgeStore'
import { formatDate, formatCurrency, formatDateTime } from '../utils/format'
import { compressImage } from '../utils/compressImage'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY_LINE = { item_id: '', qty_ordered: '', unit_cost: '' }
const EMPTY_FORM = {
  order_type: 'online', order_number: '', vendor_id: '', expected_date: '', notes: '',
  invoice_number: '', receipt_number: '', purchased_by_user_id: '', destination_location_id: '',
}

// A collapsible vendor group for the Discrepancies tab — same pattern used
// for grouped browsing elsewhere in the app (Items, Receiving order list).
function VendorGroup({ title, count, children, reportsLabel }) {
  return (
    <details open className="group bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-3 bg-gray-50 flex items-center justify-between text-sm font-semibold text-gray-700">
        <span className="flex items-center gap-2">
          <span className="text-gray-400 inline-block transition-transform group-open:rotate-90">▸</span>
          {title}
        </span>
        <span className="text-xs font-normal text-gray-400">{count} {reportsLabel}</span>
      </summary>
      <div className="border-t border-gray-100 flex flex-col gap-3 p-4">{children}</div>
    </details>
  )
}

export default function Orders() {
  const { t } = useTranslation()
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'admin'
  const canRegister = role === 'admin' || role === 'specialist' // registering orders is the Inventory Lead's job too
  const confirmDialog = useConfirm()
  const toast = useToast()
  const refreshBadges = useBadgeStore((s) => s.refresh)

  // Arrived here via "Create Order" on a worker's request ticket — prefill
  // the notes with what they asked for, and once the order is actually
  // saved, close the loop by marking that ticket fulfilled.
  const [fromRequest, setFromRequest] = useState(null)

  const STATUS_LABELS = {
    placed: t('orders.status.placed'), partially_received: t('orders.status.partiallyReceived'),
    received: t('orders.status.received'), cancelled: t('orders.status.cancelled'),
  }
  const TYPE_LABELS = { online: t('orders.type.online'), dropoff: t('orders.type.dropoff') }

  const [orders, setOrders]       = useState([])
  const [vendors, setVendors]     = useState([])
  const [items, setItems]         = useState([])
  const [locations, setLocations] = useState([])
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)

  const [tab, setTab] = useState('pending') // 'pending' | 'flagged' | 'closed' | 'all' | 'discrepancies'

  // ── Discrepancies (missing/extra items found during receiving) ─────
  // Lives here instead of its own page — it's fundamentally order data,
  // grouped by vendor for refund/credit follow-up.
  const [discrepancies, setDiscrepancies] = useState([])
  const [discrepancyStatusFilter, setDiscrepancyStatusFilter] = useState('open') // 'open' | 'resolved' | ''
  const [discrepanciesLoading, setDiscrepanciesLoading] = useState(false)
  const [resolvingId, setResolvingId] = useState(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [discrepancySavingId, setDiscrepancySavingId] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [lines, setLines]       = useState([{ ...EMPTY_LINE }])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Attachment — a receipt photo or invoice PDF. Staged locally until the
  // order exists (same deferred-upload pattern as item reference photos),
  // then uploaded right after creation.
  const attachmentInputRef = useRef(null)
  const [pendingAttachment, setPendingAttachment] = useState(null) // File/Blob, or null
  const [attachmentKind, setAttachmentKind] = useState(null) // 'image' | 'pdf' | null
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState(null)
  const [attachmentFileName, setAttachmentFileName] = useState('')
  const [attachmentError, setAttachmentError] = useState('')

  // "Scan & Suggest Items" — reads the staged attachment client-side (PDF
  // text layer, or OCR for a photo) and fuzzy-matches lines against the
  // catalog. Always a reviewable suggestion list, never auto-applied.
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [ocrSuggestions, setOcrSuggestions] = useState(null) // [{raw, item_id, sku, name, qty_ordered, confidence, checked}] | null

  const [detail, setDetail]     = useState(null) // order object with .items, or null
  const [detailLoading, setDetailLoading] = useState(false)

  const load = () => {
    setLoading(true)
    listOrders().then(d => setOrders(d.orders ?? [])).finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    listVendors({ active: 1 }).then(d => setVendors(d.vendors ?? []))
    listItems({ active: 1 }).then(d => setItems(d.items ?? []))
    listLocations({ active: 1 }).then(d => setLocations(d.locations ?? []))
    listUsers().then(d => setUsers(d.users ?? [])).catch(() => setUsers([])) // 403 for basic users; harmless here since they can't open the modal anyway
  }, [])

  const loadDiscrepancies = () => {
    setDiscrepanciesLoading(true)
    listDiscrepancies(discrepancyStatusFilter ? { status: discrepancyStatusFilter } : {})
      .then(d => setDiscrepancies(d.reports ?? []))
      .finally(() => setDiscrepanciesLoading(false))
  }
  // Only fetch once the tab is actually opened, and again whenever its own filter changes.
  useEffect(() => {
    if (tab === 'discrepancies') loadDiscrepancies()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadDiscrepancies is stable enough for this
  }, [tab, discrepancyStatusFilter])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setLines([{ ...EMPTY_LINE }])
    setPendingAttachment(null); setAttachmentKind(null); setAttachmentPreviewUrl(null); setAttachmentFileName(''); setAttachmentError('')
    setOcrRunning(false); setOcrError(''); setOcrSuggestions(null)
    setError(''); setFromRequest(null); setCreateOpen(true)
  }

  // Arrived via "Create Order" on a request ticket (Requests page) — jump
  // straight into the create form with what was asked for already noted
  // down, instead of making the Lead retype it.
  useEffect(() => {
    const req = routerLocation.state?.fromRequest
    if (!req || !canRegister) return
    openCreate()
    const parts = [t('requests.orderNotePrefillLead', { name: req.requested_by_name ?? t('requests.unknownRequester') })]
    parts.push(req.qty_requested != null
      ? t('requests.qtyLabel', { qty: req.qty_requested, unit: req.unit_of_measure || '' }) + ' — ' + req.description
      : req.description)
    if (req.vendor_hint) parts.push(t('requests.vendorHintLabel', { vendor: req.vendor_hint }))
    if (req.notes) parts.push(req.notes)
    setForm(f => ({ ...f, notes: parts.join('\n') }))
    setFromRequest(req)
    navigate(routerLocation.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on arrival only
  }, [])
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setLine = (i, k) => (e) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: e.target.value } : l))
  const addLine = () => setLines(ls => [...ls, { ...EMPTY_LINE }])
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const handleAttachmentPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    const isPdf   = file.type === 'application/pdf'
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) { setAttachmentError(t('orders.attachPhotoOrPdf')); return }
    setAttachmentError('')

    let staged = file
    if (isImage) {
      try { staged = await compressImage(file) }
      catch { setAttachmentError(t('orders.couldNotProcessPhoto')); return }
    }
    setPendingAttachment(staged)
    setAttachmentKind(isPdf ? 'pdf' : 'image')
    setAttachmentPreviewUrl(isImage ? URL.createObjectURL(staged) : null)
    setAttachmentFileName(file.name)
    setOcrError(''); setOcrSuggestions(null) // a new file invalidates any suggestions from the last one
  }
  const handleRemoveAttachment = () => {
    setPendingAttachment(null); setAttachmentKind(null); setAttachmentPreviewUrl(null); setAttachmentFileName(''); setAttachmentError('')
    setOcrError(''); setOcrSuggestions(null)
  }

  const handleScan = async () => {
    if (!pendingAttachment) return
    setOcrRunning(true); setOcrError(''); setOcrSuggestions(null)
    try {
      const { extractTextFromPdf, extractTextFromImage } = await import('../utils/ocrOrder')
      const text = attachmentKind === 'pdf' ? await extractTextFromPdf(pendingAttachment) : await extractTextFromImage(pendingAttachment)
      const { suggestOrderLines } = await import('../utils/matchOrderItems')
      const suggestions = suggestOrderLines(text, items)
      if (suggestions.length === 0) {
        setOcrError(t('orders.couldntConfidentlyMatch'))
      }
      setOcrSuggestions(suggestions.map((s) => ({ ...s, checked: true })))
    } catch (err) {
      setOcrError(err?.message || t('orders.couldNotScanFile'))
    } finally {
      setOcrRunning(false)
    }
  }
  const toggleSuggestion = (idx) => setOcrSuggestions(ss => ss.map((s, i) => i === idx ? { ...s, checked: !s.checked } : s))
  const setSuggestionQty = (idx, val) => setOcrSuggestions(ss => ss.map((s, i) => i === idx ? { ...s, qty_ordered: val } : s))
  const applySuggestions = () => {
    const checked = (ocrSuggestions ?? []).filter((s) => s.checked)
    if (!checked.length) return
    setLines(ls => {
      const existing = ls.filter((l) => l.item_id || l.qty_ordered) // keep any rows already filled in by hand
      const added = checked.map((s) => ({ item_id: s.item_id, qty_ordered: s.qty_ordered, unit_cost: '' }))
      return existing.length || added.length ? [...existing, ...added] : [{ ...EMPTY_LINE }]
    })
    setOcrSuggestions(null)
  }

  const handleCreate = async () => {
    const validLines = lines.filter(l => l.item_id && l.qty_ordered)
    if (!validLines.length) { setError(t('orders.addLeastOneLine')); return }
    if (form.order_type === 'dropoff') {
      if (!form.vendor_id) { setError(t('orders.chooseWherePurchased')); return }
      if (!form.purchased_by_user_id) { setError(t('orders.chooseWhoPurchased')); return }
      if (!form.destination_location_id) { setError(t('orders.chooseWarehouseGoing')); return }
      if (!form.receipt_number.trim()) { setError(t('orders.receiptNumberRequired')); return }
    } else {
      if (!form.expected_date) { setError(t('orders.expectedDateRequired')); return }
      if (!form.invoice_number.trim()) { setError(t('orders.invoiceNumberRequired')); return }
    }
    setSaving(true); setError('')
    try {
      const { id } = await createOrder({
        order_type: form.order_type,
        order_number: form.order_number || null,
        vendor_id: form.vendor_id || null,
        expected_date: form.expected_date || null,
        invoice_number: form.invoice_number || null,
        receipt_number: form.receipt_number || null,
        purchased_by_user_id: form.purchased_by_user_id || null,
        destination_location_id: form.destination_location_id || null,
        notes: form.notes || null,
        items: validLines.map(l => ({
          item_id: l.item_id, qty_ordered: parseFloat(l.qty_ordered),
          unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : null,
        })),
      })
      // Soft-fail: a failed attachment upload shouldn't undo a successful order.
      if (pendingAttachment) {
        try { await uploadOrderAttachment(id, pendingAttachment) }
        catch { /* order still saved fine; can be attached later from the detail view */ }
      }
      // Soft-fail here too — the order itself is what matters; if this call
      // fails the ticket just stays open and can be linked manually later.
      if (fromRequest) {
        try { await resolveRequest(fromRequest.id, { status: 'ordered', order_id: id }) } catch { /* see above */ }
        setFromRequest(null)
      }
      setCreateOpen(false); load(); refreshBadges(true)
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const openDetail = async (o) => {
    setDetailLoading(true); setDetail({ id: o.id })
    try { setDetail(await getOrder(o.id)) } finally { setDetailLoading(false) }
  }

  const handleDelete = async (o) => {
    if (!await confirmDialog(t('orders.deleteOrderConfirm', { order: o.order_number || '#' + o.id }), { danger: true, confirmLabel: t('common.delete') })) return
    try { await deleteOrder(o.id); setDetail(null); load(); refreshBadges(true) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('orders.couldNotDelete')) }
  }

  const [closingOrder, setClosingOrder] = useState(false)
  const handleCloseOrder = async (o) => {
    if (!await confirmDialog(t('orders.closeOrderConfirm'), { title: t('orders.closeOrderTitle'), confirmLabel: t('orders.closeOrder') })) return
    setClosingOrder(true)
    try {
      await closeOrder(o.id)
      toast.success(t('orders.orderClosed'))
      const fresh = await getOrder(o.id)
      setDetail(fresh)
      load(); refreshBadges(true)
    } catch (err) {
      toast.error(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setClosingOrder(false) }
  }

  const startResolve  = (id) => { setResolvingId(id); setResolutionNotes('') }
  const cancelResolve = () => { setResolvingId(null); setResolutionNotes('') }

  const confirmResolveDiscrepancy = async (id) => {
    setDiscrepancySavingId(id)
    try { await resolveDiscrepancy(id, resolutionNotes.trim() || null); setResolvingId(null); loadDiscrepancies(); load(); refreshBadges(true) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('orders.couldNotResolve')) }
    finally { setDiscrepancySavingId(null) }
  }
  const handleReopenDiscrepancy = async (id) => {
    setDiscrepancySavingId(id)
    try { await reopenDiscrepancy(id); loadDiscrepancies(); load(); refreshBadges(true) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('orders.couldNotReopen')) }
    finally { setDiscrepancySavingId(null) }
  }

  const noVendorLabel = t('items.noVendorGroup')
  const groupedDiscrepancies = (() => {
    const map = new Map()
    for (const r of discrepancies) {
      const key = r.vendor_name || noVendorLabel
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === noVendorLabel) return 1
      if (b === noVendorLabel) return -1
      return a.localeCompare(b)
    })
  })()

  const handleDetailRemoveAttachment = async () => {
    if (!detail) return
    try { await deleteOrderAttachment(detail.id); setDetail(d => ({ ...d, attachment_url: null, attachment_path: null })) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('orders.couldNotRemoveAttachment')) }
  }

  // Three distinct buckets, not just open/closed:
  //  - Pending  = still just waiting on the rest of the delivery — nothing
  //               reported wrong yet.
  //  - Flagged  = has an open discrepancy report (a refund/credit being
  //               chased) — true whether the rest of the order is still
  //               outstanding (a short shipment nothing more is coming for)
  //               or it arrived in full otherwise. Either way it's not just
  //               "waiting to arrive" anymore, so it doesn't belong in Pending.
  //  - Closed   = arrived in full, nothing outstanding against it.
  const isPending = (o) => (o.status === 'placed' || o.status === 'partially_received') && !o.has_open_discrepancy
  const isFlagged = (o) => o.has_open_discrepancy
  const isClosed  = (o) => o.status === 'received' && !o.has_open_discrepancy
  const visibleOrders = orders.filter((o) => {
    if (tab === 'all') return true
    if (tab === 'closed') return isClosed(o)
    if (tab === 'flagged') return isFlagged(o)
    return isPending(o)
  })

  const reportsLabel = (n) => n === 1 ? t('orders.reportSingular') : t('orders.reportPlural')

  return (
    <div className="w-full">
      <PageHeader title={t('orders.title')} subtitle={t('orders.subtitle')}
        actions={canRegister && tab !== 'discrepancies' && <Button onClick={openCreate}>{t('orders.newOrder')}</Button>} />

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['pending', t('orders.tabPending')], ['flagged', t('orders.tabFlagged')], ['closed', t('orders.tabClosed')], ['all', t('orders.tabAll')], ['discrepancies', t('orders.tabDiscrepancies')]].map(([val, label]) => (
          <button key={val} type="button" onClick={() => setTab(val)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === val ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'discrepancies' ? (
        <>
          <div className="flex gap-2 mb-4">
            {[['open', t('common.open')], ['resolved', t('common.resolved')], ['', t('orders.tabAll')]].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setDiscrepancyStatusFilter(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  discrepancyStatusFilter === val ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {discrepanciesLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : discrepancies.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <p className="text-center text-gray-400 py-16 text-sm">
                {discrepancyStatusFilter === 'open' ? t('orders.noOpenDiscrepancies') : t('items.nothingHere')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedDiscrepancies.map(([vendorName, vendorReports]) => (
                <VendorGroup key={vendorName} title={vendorName} count={vendorReports.length} reportsLabel={reportsLabel(vendorReports.length)}>
                  {vendorReports.map((r) => (
                    <div key={r.id} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {r.order_number || t('orders.orderHash', { id: r.order_id })}
                            <span className="ml-2"><Badge variant={r.order_type}>{TYPE_LABELS[r.order_type] ?? r.order_type}</Badge></span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {t('orders.reportedBy', { name: r.reported_by_name ?? '—', date: formatDateTime(r.created_at) })}
                          </p>
                        </div>
                        <Badge variant={r.status === 'open' ? 'low_stock' : 'in_stock'}>{r.status === 'open' ? t('common.open') : t('common.resolved')}</Badge>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {r.items.map((it) => (
                          <div key={it.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                            it.type === 'missing' ? 'bg-amber-50 text-amber-800' : 'bg-violet-50 text-violet-800'
                          }`}>
                            <span className="truncate">
                              <span className="font-semibold">{it.type === 'missing' ? t('orders.missing') : t('orders.extra')}:</span>{' '}
                              {it.item_id ? `${it.sku} — ${it.item_name}` : (it.description || t('orders.unidentifiedItemFallback'))}
                            </span>
                            <span className="font-mono shrink-0">{it.qty} {it.unit_of_measure ?? ''}</span>
                          </div>
                        ))}
                      </div>

                      {r.notes && <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{r.notes}</p>}

                      {r.status === 'resolved' ? (
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs text-gray-500">
                            <p>{t('orders.resolvedBy', { name: r.resolved_by_name ?? '—', date: r.resolved_at ? formatDateTime(r.resolved_at) : '' })}</p>
                            {r.resolution_notes && <p className="mt-0.5 text-gray-600">{r.resolution_notes}</p>}
                          </div>
                          <button type="button" onClick={() => handleReopenDiscrepancy(r.id)} disabled={discrepancySavingId === r.id}
                            className="text-xs font-semibold text-gray-400 hover:text-gray-600 shrink-0 disabled:opacity-50">
                            {t('orders.reopen')}
                          </button>
                        </div>
                      ) : resolvingId === r.id ? (
                        <div className="flex flex-col gap-2">
                          <input type="text" placeholder={t('orders.resolutionNotesPlaceholder')} value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => confirmResolveDiscrepancy(r.id)} loading={discrepancySavingId === r.id} className="w-fit">{t('orders.confirmResolved')}</Button>
                            <Button size="sm" variant="secondary" onClick={cancelResolve} className="w-fit">{t('common.cancel')}</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => startResolve(r.id)} className="w-fit">{t('orders.markResolved')}</Button>
                      )}
                    </div>
                  ))}
                </VendorGroup>
              ))}
            </div>
          )}
        </>
      ) : loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {visibleOrders.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">
              {orders.length === 0
                ? t('orders.noOrdersYet')
                : tab === 'pending' ? t('orders.nothingPending')
                : tab === 'flagged' ? t('orders.nothingFlagged')
                : t('orders.noOrdersHere')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('orders.colOrder'), t('orders.colType'), t('common.vendor'), t('orders.colStatus'), t('orders.colProgress'), t('orders.colExpected'), t('orders.colPlacedBy'), ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleOrders.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(o)}>
                      <td className="px-4 py-3 font-medium text-gray-900">{o.order_number || `#${o.id}`}</td>
                      <td className="px-4 py-3"><Badge variant={o.order_type}>{TYPE_LABELS[o.order_type] ?? o.order_type}</Badge></td>
                      <td className="px-4 py-3 text-gray-600">{o.vendor_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={o.status}>{STATUS_LABELS[o.status]}</Badge>
                          {o.has_open_discrepancy ? <Badge variant="low_stock">{t('orders.discrepancyBadge')}</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{o.qty_received_total} / {o.qty_ordered_total}</td>
                      <td className="px-4 py-3 text-gray-600">{o.expected_date ? formatDate(o.expected_date) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{o.placed_by_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-brand-500">{t('orders.view')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Create order modal (specialist/admin) ───────────────────── */}
      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); setFromRequest(null) }} title={t('orders.newOrderTitle')} size="lg">
        <div className="flex flex-col gap-4">
          {fromRequest && (
            <div className="bg-brand-100 text-brand-800 rounded-xl px-4 py-3 text-sm">
              {t('requests.fulfillingBanner', { name: fromRequest.requested_by_name ?? t('requests.unknownRequester') })}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('orders.orderType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {['online', 'dropoff'].map((ty) => (
                <button key={ty} type="button" onClick={() => setForm(f => ({ ...f, order_type: ty }))}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold text-left transition-colors ${
                    form.order_type === ty ? 'border-brand-500 bg-brand-100 text-brand-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}>
                  {ty === 'online' ? t('orders.type.online') : t('orders.dropoffLong')}
                  <span className="block text-xs font-normal opacity-70 mt-0.5">
                    {ty === 'online' ? t('orders.onlineHint') : t('orders.dropoffHint')}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Attach the receipt photo or invoice PDF as the permanent record */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {form.order_type === 'dropoff' ? t('orders.receiptPhoto') : t('orders.invoicePhotoOrPdf')} <span className="text-gray-400 font-normal">({t('common.optional')})</span>
            </label>
            <input ref={attachmentInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleAttachmentPick} className="hidden" />
            {pendingAttachment ? (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-2">
                {attachmentKind === 'image' ? (
                  <img src={attachmentPreviewUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-2xl shrink-0">📄</div>
                )}
                <span className="text-sm text-gray-600 truncate flex-1">{attachmentFileName}</span>
                <button type="button" onClick={handleRemoveAttachment} className="text-xs font-semibold text-red-500 hover:underline shrink-0">{t('items.removePhoto')}</button>
              </div>
            ) : (
              <Button type="button" variant="secondary" size="md" onClick={() => attachmentInputRef.current?.click()} className="w-fit">
                📎 {form.order_type === 'dropoff' ? t('orders.attachReceiptPhoto') : t('orders.attachInvoice')}
              </Button>
            )}
            {attachmentError && <p className="text-xs text-red-500">{attachmentError}</p>}

            {pendingAttachment && ocrSuggestions === null && (
              <Button type="button" variant="secondary" size="sm" onClick={handleScan} loading={ocrRunning} className="w-fit mt-1">
                🔍 {t('orders.scanAndSuggest')}
              </Button>
            )}
            {ocrError && <p className="text-xs text-amber-600">{ocrError}</p>}

            {ocrSuggestions !== null && ocrSuggestions.length > 0 && (
              <div className="mt-1 border border-brand-200 bg-brand-50/60 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-xs font-semibold text-brand-800">
                  {t('orders.foundPossibleMatches', { count: ocrSuggestions.length })}
                </p>
                {ocrSuggestions.map((s, i) => (
                  <label key={`${s.item_id}-${i}`} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5">
                    <input type="checkbox" checked={s.checked} onChange={() => toggleSuggestion(i)} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{s.sku} — {s.name}</p>
                      <p className="text-xs text-gray-400 truncate">{t('orders.fromRaw', { raw: s.raw })}</p>
                    </div>
                    <input type="number" step="0.01" value={s.qty_ordered} onChange={(e) => setSuggestionQty(i, e.target.value)}
                      className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-brand-500 shrink-0" />
                  </label>
                ))}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={applySuggestions} className="w-fit">{t('orders.addCheckedToOrder')}</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setOcrSuggestions(null)} className="w-fit">{t('orders.discard')}</Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label={t('orders.orderPoNumberOptional')} value={form.order_number} onChange={set('order_number')} />
            {form.order_type === 'online' ? (
              <Input label={t('orders.expectedArrivalDate')} type="date" value={form.expected_date} onChange={set('expected_date')} />
            ) : (
              <Input label={t('orders.receiptNumberField')} value={form.receipt_number} onChange={set('receipt_number')} placeholder={t('orders.fromTheReceipt')} />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{form.order_type === 'dropoff' ? t('orders.purchasedFrom') : t('orders.vendorOptionalField')}</label>
            <select value={form.vendor_id} onChange={set('vendor_id')}
              className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
              <option value="">{form.order_type === 'dropoff' ? t('orders.selectWhereBought') : t('common.none')}</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {form.order_type === 'dropoff' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{t('orders.purchasedByField')}</label>
                <select value={form.purchased_by_user_id} onChange={set('purchased_by_user_id')}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  <option value="">{t('orders.selectEllipsis')}</option>
                  {users.filter(u => u.is_active).map(u => <option key={u.fieldclock_user_id} value={u.fieldclock_user_id}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{t('orders.storingAt')}</label>
                <select value={form.destination_location_id} onChange={set('destination_location_id')}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  <option value="">{t('orders.selectWarehouse')}</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('orders.invoiceNumberField')} value={form.invoice_number} onChange={set('invoice_number')} placeholder={t('orders.fromTheInvoice')} />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{t('orders.storingAt')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
                <select value={form.destination_location_id} onChange={set('destination_location_id')}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  <option value="">{t('orders.notDecidedYet')}</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">{t('orders.lineItems')}</label>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2 items-start">
                <select value={line.item_id} onChange={setLine(i, 'item_id')}
                  className="flex-1 min-w-0 rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  <option value="">{t('orders.selectItemShort')}</option>
                  {items.map(it => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
                </select>
                <input type="number" step="0.01" placeholder={t('receiving.qty')} value={line.qty_ordered} onChange={setLine(i, 'qty_ordered')}
                  className="w-24 rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                <input type="number" step="0.01" placeholder={t('orders.unitDollar')} value={line.unit_cost} onChange={setLine(i, 'unit_cost')}
                  className="w-24 rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-red-500 text-sm px-2 py-2.5">✕</button>
                )}
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addLine} className="w-fit">{t('orders.addLine')}</Button>
          </div>

          <Input label={t('common.notes')} value={form.notes} onChange={set('notes')} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={handleCreate} loading={saving} fullWidth>{t('orders.saveOrder')}</Button>
        </div>
      </Modal>

      {/* ── Order detail modal ───────────────────────────────────────── */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.order_number || (detail ? `#${detail.id}` : '')} size="lg">
        {detailLoading || !detail?.items ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div><span className="text-gray-400">{t('orders.typeLabel')} </span><Badge variant={detail.order_type}>{TYPE_LABELS[detail.order_type] ?? detail.order_type}</Badge></div>
              <div>
                <span className="text-gray-400">{t('orders.statusLabel')} </span>
                <Badge variant={detail.status}>{STATUS_LABELS[detail.status]}</Badge>
                {detail.has_open_discrepancy ? <Badge variant="low_stock" className="ml-1.5">{t('orders.discrepancyBadge')}</Badge> : null}
                {/* Closed via "nothing more coming" rather than a full delivery — still worth knowing at a glance. */}
                {detail.status === 'received' && detail.items.some(li => Number(li.qty_received) < Number(li.qty_ordered)) && (
                  <Badge variant="partially_received" className="ml-1.5">{t('orders.closedShortBadge')}</Badge>
                )}
              </div>
              <div><span className="text-gray-400">{t('common.vendor')}: </span><span className="text-gray-700">{detail.vendor_name ?? '—'}</span></div>
              {detail.order_type === 'online' ? (
                <>
                  <div><span className="text-gray-400">{t('orders.expectedLabel')} </span><span className="text-gray-700">{detail.expected_date ? formatDate(detail.expected_date) : '—'}</span></div>
                  <div><span className="text-gray-400">{t('orders.invoiceHashLabel')} </span><span className="text-gray-700 font-mono">{detail.invoice_number ?? '—'}</span></div>
                </>
              ) : (
                <>
                  <div><span className="text-gray-400">{t('orders.purchasedByLabel')} </span><span className="text-gray-700">{detail.purchased_by_name ?? '—'}</span></div>
                  <div><span className="text-gray-400">{t('orders.receiptHashLabel')} </span><span className="text-gray-700 font-mono">{detail.receipt_number ?? '—'}</span></div>
                </>
              )}
              <div><span className="text-gray-400">{t('orders.storingAtLabel')} </span><span className="text-gray-700">{detail.destination_location_name ?? '—'}</span></div>
              <div><span className="text-gray-400">{t('orders.placedByLabel')} </span><span className="text-gray-700">{detail.placed_by_name ?? '—'}</span></div>
            </div>

            {detail.attachment_url && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                {detail.attachment_url.endsWith('.pdf') ? (
                  <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xl shrink-0">📄</div>
                ) : (
                  <img src={detail.attachment_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                )}
                <a href={detail.attachment_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-500 hover:underline flex-1">
                  {detail.order_type === 'dropoff' ? t('orders.viewReceipt') : t('orders.viewInvoice')}
                </a>
                {isAdmin && (
                  <button type="button" onClick={handleDetailRemoveAttachment} className="text-xs font-semibold text-red-500 hover:underline shrink-0">{t('items.removePhoto')}</button>
                )}
              </div>
            )}

            {detail.notes && <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{detail.notes}</p>}

            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('common.item'), t('orders.colOrdered'), t('orders.colReceived'), t('items.unitCost')].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.items.map(li => (
                    <tr key={li.id}>
                      <td className="px-3 py-2 text-gray-900">{li.sku} — {li.item_name}</td>
                      <td className="px-3 py-2 text-gray-600">{li.qty_ordered} {li.unit_of_measure}</td>
                      <td className="px-3 py-2 text-gray-600">{li.qty_received} {li.unit_of_measure}</td>
                      <td className="px-3 py-2 text-gray-600">{li.unit_cost != null ? formatCurrency(li.unit_cost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canRegister && detail.status === 'partially_received' && !detail.has_open_discrepancy && (
              <div className="flex flex-col gap-1.5 bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">{t('orders.closeOrderHint')}</p>
                <Button variant="secondary" loading={closingOrder} onClick={() => handleCloseOrder(detail)} className="w-fit">
                  {t('orders.closeOrder')}
                </Button>
              </div>
            )}

            {isAdmin && (
              <Button variant="danger" onClick={() => handleDelete(detail)}>{t('orders.deleteOrder')}</Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
