import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import ScannerLoading from '../components/ui/ScannerLoading'
import { listItems, lookupItemByBarcode } from '../api/items'
import { listLocations } from '../api/locations'
import { listVendors } from '../api/vendors'
import { listOrders, getOrder } from '../api/orders'
import { receiveStock } from '../api/stock'
import { createDiscrepancyReport } from '../api/discrepancies'
import { formatDate } from '../utils/format'
import { useConfirm } from '../components/ConfirmProvider'
import { useBadgeStore } from '../store/badgeStore'

const EMPTY = { item_id: '', location_id: '', qty: '', vendor_id: '', reference: '', notes: '' }
const OPEN_STATUSES = ['placed', 'partially_received']
const BarcodeScanner = lazy(() => import('../components/ui/BarcodeScanner'))

export default function Receiving() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const refreshBadges = useBadgeStore((s) => s.refresh)
  const TYPE_LABELS = { online: t('orders.type.online'), dropoff: t('orders.type.dropoff') }
  const STATUS_LABELS = {
    placed: t('orders.status.placed'), partially_received: t('orders.status.partiallyReceived'),
    received: t('orders.status.received'), cancelled: t('orders.status.cancelled'),
  }

  const [items, setItems]         = useState([])
  const [locations, setLocations] = useState([])
  const [vendors, setVendors]     = useState([])
  const [openOrders, setOpenOrders] = useState([])
  const [orderVendorFilter, setOrderVendorFilter] = useState('') // narrow down ahead of the truck arriving
  const [orderSearch, setOrderSearch] = useState('') // look up by order # once the paper invoice is in hand
  const [orderId, setOrderId]     = useState('')
  const [orderDetail, setOrderDetail] = useState(null)
  const [freeformMode, setFreeformMode] = useState(false) // only true once "Can't find the order?" is explicitly chosen
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)

  // ── Delivery checklist (fulfilling an order) ─────────────────────
  // One row per still-open order line: check it off once you've physically
  // verified it, adjusting qty only if what actually arrived differs from
  // what's expected. Anything checked off with a different qty — or found
  // extra and unlisted entirely — gets auto-flagged and, on submit, filed
  // as a discrepancy report for a refund/credit follow-up.
  const [checklistLines, setChecklistLines] = useState([])
  const [extraLines, setExtraLines]         = useState([])
  const [checklistSaving, setChecklistSaving] = useState(false)
  const [checklistError, setChecklistError]   = useState('')
  const [checklistSuccess, setChecklistSuccess] = useState('')

  const loadOpenOrders = () => listOrders().then(d => setOpenOrders((d.orders ?? []).filter(ord => OPEN_STATUSES.includes(ord.status))))

  useEffect(() => {
    Promise.all([listItems({ active: 1 }), listLocations({ active: 1 }), listVendors({ active: 1 }), listOrders()])
      .then(([i, l, v, o]) => {
        const locs = l.locations ?? []
        setItems(i.items ?? []); setLocations(locs); setVendors(v.vendors ?? [])
        setOpenOrders((o.orders ?? []).filter(ord => OPEN_STATUSES.includes(ord.status)))
        // Receiving only ever happens at the Woodruff Rd. warehouse (the
        // physical receiving dock) — auto-fill it instead of asking.
        const receivingLoc = locs.find(l2 => l2.name.toLowerCase().includes('woodruff'))
        if (receivingLoc) setForm(f => ({ ...f, location_id: String(receivingLoc.id) }))
      })
  }, [])

  useEffect(() => {
    if (!orderId) { setOrderDetail(null); return }
    getOrder(orderId).then((o) => {
      setOrderDetail(o)
      setForm(f => ({ ...f, item_id: '', vendor_id: o.vendor_id ? String(o.vendor_id) : f.vendor_id, reference: o.order_number || f.reference }))
    })
  }, [orderId])

  // Rebuild the checklist whenever the selected order (re)loads — including
  // right after a submit, so already-settled lines drop off automatically.
  useEffect(() => {
    if (!orderDetail) { setChecklistLines([]); setExtraLines([]); return }
    setChecklistLines(
      orderDetail.items
        .map((li) => ({
          item_id: li.item_id, sku: li.sku, name: li.item_name, unit_of_measure: li.unit_of_measure,
          remaining: li.qty_ordered - li.qty_received, checked: false, qty: String(li.qty_ordered - li.qty_received),
        }))
        .filter((l) => l.remaining > 0)
    )
    setExtraLines([])
    setChecklistError(''); setChecklistSuccess('')
  }, [orderDetail])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  // When fulfilling an order via the freeform-style scanner lookup, only
  // offer that order's still-open lines.
  const itemOptions = orderDetail
    ? orderDetail.items.filter(li => li.qty_received < li.qty_ordered)
      .map(li => ({ id: li.item_id, sku: li.sku, name: li.item_name, unit_of_measure: li.unit_of_measure, remaining: li.qty_ordered - li.qty_received }))
    : items

  const selectedItem = itemOptions.find(i => String(i.id) === form.item_id)
  const receivingLocation = locations.find(l => l.name.toLowerCase().includes('woodruff')) ?? null

  // Narrow the order list two ways: pick a vendor ahead of time (before the
  // truck shows up, if you know who's delivering), or search by order # once
  // you're holding the physical invoice and just need to look it up fast.
  const filteredOpenOrders = openOrders.filter((o) => {
    if (orderVendorFilter && String(o.vendor_id) !== orderVendorFilter) return false
    if (orderSearch && !(o.order_number || `#${o.id}`).toLowerCase().includes(orderSearch.toLowerCase())) return false
    return true
  })
  const orderVendors = [...new Map(openOrders.filter(o => o.vendor_id).map(o => [o.vendor_id, o.vendor_name])).entries()]

  const handleScan = async (barcode) => {
    setScannerOpen(false)
    try {
      const item = await lookupItemByBarcode(barcode)
      if (!itemOptions.some(i => i.id === item.id)) {
        setError(orderDetail
          ? t('receiving.notOnOrder', { name: item.name })
          : t('receiving.notInActiveList', { name: item.name }))
        return
      }
      setForm(f => ({ ...f, item_id: String(item.id) }))
      setError('')
    } catch (err) {
      setError(err?.response?.data?.error ?? t('receiving.barcodeNotFound', { barcode }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.item_id || !form.location_id) { setError(t('receiving.chooseItemAndLocation')); return }
    if (!form.qty || parseFloat(form.qty) <= 0) { setError(t('items.enterQtyPositive')); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      await receiveStock({
        item_id: form.item_id,
        location_id: form.location_id,
        qty: parseFloat(form.qty),
        vendor_id: form.vendor_id || null,
        reference: form.reference || null,
        notes: form.notes || null,
        order_id: orderId || null,
      })
      setSuccess(t('receiving.receivedSuccess', { qty: form.qty, unit: selectedItem?.unit_of_measure ?? '', name: selectedItem?.name ?? t('takeDropoff.genericItem') }))
      setForm(f => ({ ...EMPTY, location_id: f.location_id, vendor_id: f.vendor_id, reference: f.reference }))
      if (orderId) { getOrder(orderId).then(setOrderDetail); loadOpenOrders(); refreshBadges(true) }
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  // ── Checklist handlers ────────────────────────────────────────────
  const toggleChecklistLine = (idx) => setChecklistLines(ls => ls.map((l, i) => i === idx ? { ...l, checked: !l.checked } : l))
  const setChecklistQty = (idx, val) => setChecklistLines(ls => ls.map((l, i) => i === idx ? { ...l, qty: val } : l))

  const addExtraLine = () => setExtraLines(ls => [...ls, { item_id: '', description: '', qty: '' }])
  const removeExtraLine = (idx) => setExtraLines(ls => ls.filter((_, i) => i !== idx))
  const setExtraLine = (idx, key, val) => setExtraLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))

  const handleChecklistSubmit = async () => {
    const toReceive   = checklistLines.filter(l => l.checked)
    const validExtras = extraLines.filter(l => l.qty && parseFloat(l.qty) > 0 && (l.item_id || l.description.trim()))
    if (!toReceive.length && !validExtras.length) {
      setChecklistError(t('receiving.checkAtLeastOne'))
      return
    }
    if (!receivingLocation) {
      setChecklistError(t('receiving.noReceivingLocation'))
      return
    }

    const flagged = toReceive.filter(l => parseFloat(l.qty || 0) !== l.remaining).length + validExtras.length
    const confirmMsg = t('receiving.confirmLinesConfirmed', { count: toReceive.length })
      + (flagged > 0 ? t('receiving.confirmFlagged', { count: flagged }) : t('receiving.confirmAllMatching'))
      + '\n\n' + t('receiving.confirmMakeSure')
    if (!await confirmDialog(confirmMsg, { title: t('receiving.confirmTitle'), confirmLabel: t('receiving.confirmButton') })) return

    setChecklistSaving(true); setChecklistError(''); setChecklistSuccess('')
    try {
      const discrepancyLines = []
      const reference = orderDetail.order_number || `#${orderDetail.id}`

      for (const line of toReceive) {
        const qty = parseFloat(line.qty || 0)
        if (qty > 0) {
          await receiveStock({ item_id: line.item_id, location_id: receivingLocation.id, qty, reference, order_id: orderDetail.id })
        }
        if (qty < line.remaining) {
          discrepancyLines.push({ item_id: line.item_id, type: 'missing', qty: line.remaining - qty })
        } else if (qty > line.remaining) {
          discrepancyLines.push({ item_id: line.item_id, type: 'extra', qty: qty - line.remaining })
        }
      }

      for (const extra of validExtras) {
        const qty = parseFloat(extra.qty)
        // Only receive it into stock if it's a recognized catalog item —
        // a totally unidentified extra just gets reported, not stocked.
        if (extra.item_id) {
          await receiveStock({ item_id: extra.item_id, location_id: receivingLocation.id, qty, reference, order_id: orderDetail.id })
        }
        discrepancyLines.push({ item_id: extra.item_id || null, type: 'extra', qty, description: extra.description.trim() || null })
      }

      if (discrepancyLines.length > 0) {
        await createDiscrepancyReport({ order_id: orderDetail.id, items: discrepancyLines })
      }

      setChecklistSuccess(
        t('receiving.checkLogged') + (discrepancyLines.length ? ' ' + t('receiving.flaggedCount', { count: discrepancyLines.length }) : '')
      )
      getOrder(orderDetail.id).then(setOrderDetail)
      loadOpenOrders()
      refreshBadges(true) // a discrepancy may have just been filed, or the order finished/partially finished
    } catch (err) {
      setChecklistError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally {
      setChecklistSaving(false)
    }
  }

  return (
    <div className="w-full">
      <PageHeader title={t('receiving.title')} subtitle={t('receiving.subtitle')} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,26rem)_1fr] gap-6 items-start">
        <Card>
          {orderDetail ? (
            // ── Verify Delivery checklist ──────────────────────────
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{t('receiving.verifyDelivery')}</h3>
                  <p className="text-xs text-gray-400">{orderDetail.order_number || `#${orderDetail.id}`} — {orderDetail.vendor_name ?? t('dashboard.noVendor')}</p>
                </div>
                <button type="button" onClick={() => { setOrderId(''); setFreeformMode(true) }} className="text-xs font-semibold text-gray-400 hover:text-gray-600 shrink-0">{t('receiving.switchToFreeform')}</button>
              </div>

              {checklistLines.length === 0 ? (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-6 text-center">{t('receiving.allLinesReceived')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {checklistLines.map((line, i) => {
                    const qtyNum = parseFloat(line.qty || 0)
                    const diff = qtyNum - line.remaining
                    return (
                      <div key={line.item_id} className={`rounded-xl border px-3 py-2.5 transition-colors ${line.checked ? 'border-brand-300 bg-brand-50/50' : 'border-gray-100'}`}>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={line.checked} onChange={() => toggleChecklistLine(i)} className="shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{line.sku} — {line.name}</p>
                            <p className="text-xs text-gray-400">{t('receiving.expecting', { qty: line.remaining, unit: line.unit_of_measure })}</p>
                          </div>
                          <input type="number" step="0.01" value={line.qty} disabled={!line.checked}
                            onChange={(e) => setChecklistQty(i, e.target.value)} onClick={(e) => e.stopPropagation()}
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400 shrink-0" />
                        </label>
                        {line.checked && diff !== 0 && (
                          <p className={`text-xs font-semibold mt-1 ml-6 ${diff < 0 ? 'text-amber-600' : 'text-violet-600'}`}>
                            {diff < 0 ? t('receiving.shortBy', { qty: Math.abs(diff) }) : t('receiving.over', { qty: diff })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">{t('receiving.anythingExtra')} <span className="text-gray-400 font-normal">{t('receiving.notOnOrderHint')}</span></label>
                {extraLines.map((extra, i) => (
                  <div key={i} className="flex flex-col gap-1.5 bg-gray-50 rounded-xl p-2">
                    <div className="flex gap-2">
                      <select value={extra.item_id} onChange={(e) => setExtraLine(i, 'item_id', e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500">
                        <option value="">{t('receiving.unidentifiedItem')}</option>
                        {items.map(it => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
                      </select>
                      <input type="number" step="0.01" placeholder={t('receiving.qty')} value={extra.qty} onChange={(e) => setExtraLine(i, 'qty', e.target.value)}
                        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500 shrink-0" />
                      <button type="button" onClick={() => removeExtraLine(i)} className="text-red-500 text-sm px-1 shrink-0">✕</button>
                    </div>
                    {!extra.item_id && (
                      <input type="text" placeholder={t('receiving.describeIt')} value={extra.description} onChange={(e) => setExtraLine(i, 'description', e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500" />
                    )}
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={addExtraLine} className="w-fit">{t('receiving.addExtraItem')}</Button>
              </div>

              {checklistError && <p className="text-xs text-red-500">{checklistError}</p>}
              {checklistSuccess && <p className="text-xs text-brand-700 font-medium">{checklistSuccess}</p>}
              <Button onClick={handleChecklistSubmit} loading={checklistSaving} fullWidth>{t('receiving.submitCheck')}</Button>
            </div>
          ) : freeformMode ? (
            // ── Freeform receipt (last resort) ─────────────────────
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {openOrders.length > 0 && (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
                  {t('receiving.freeformHint')}
                </p>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{t('common.item')}</label>
                <div className="flex gap-2">
                  <select value={form.item_id} onChange={set('item_id')}
                    className="flex-1 min-w-0 rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                    <option value="">{t('common.selectItem')}</option>
                    {itemOptions.map(i => (
                      <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="secondary" size="md" onClick={() => setScannerOpen(true)}>
                    📷
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{t('common.location')}</label>
                {receivingLocation ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-base text-gray-700">{receivingLocation.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('receiving.onlyLoggedHere')}</p>
                  </div>
                ) : (
                  <select value={form.location_id} onChange={set('location_id')}
                    className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                    <option value="">{t('items.selectLocation')}</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
              </div>

              <Input label={`${t('receiving.quantityReceived')}${selectedItem ? ` (${selectedItem.unit_of_measure})` : ''}`}
                type="number" step="0.01" inputMode="decimal" value={form.qty} onChange={set('qty')} />

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{t('receiving.vendorOptional')}</label>
                <select value={form.vendor_id} onChange={set('vendor_id')}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  <option value="">{t('common.none')}</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <Input label={t('receiving.poReference')} value={form.reference} onChange={set('reference')} />

              <Input label={t('common.notes')} value={form.notes} onChange={set('notes')} />

              {error && <p className="text-xs text-red-500">{error}</p>}
              {success && <p className="text-xs text-brand-700 font-medium">{success}</p>}
              <Button type="submit" loading={saving} fullWidth>{t('receiving.logReceipt')}</Button>
            </form>
          ) : (
            // ── Default state: nothing chosen yet ──────────────────
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-2xl">📋</div>
              <div>
                <p className="text-sm font-semibold text-gray-700">{t('receiving.selectOrderToBegin')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('receiving.selectOrderHint')}</p>
              </div>
              <button type="button" onClick={() => setFreeformMode(true)} className="text-xs font-semibold text-gray-400 hover:text-gray-600 underline underline-offset-2">
                {t('receiving.cantFindLast')}
              </button>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title={t('receiving.fulfillingOrder')}>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2 mb-1">
                <input type="text" placeholder={t('receiving.searchByOrderNum')} value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                <select value={orderVendorFilter} onChange={(e) => setOrderVendorFilter(e.target.value)}
                  className="w-full sm:w-36 min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-brand-500">
                  <option value="">{t('items.allVendors')}</option>
                  {orderVendors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>

              {filteredOpenOrders.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">
                  {openOrders.length === 0 ? t('receiving.noOpenOrders') : t('receiving.noOrdersMatch')}
                </p>
              )}

              {filteredOpenOrders.map((o) => {
                const selected = String(o.id) === String(orderId)
                return (
                  <button key={o.id} type="button" onClick={() => { setOrderId(String(o.id)); setFreeformMode(false) }}
                    className={`text-left rounded-xl px-3 py-2.5 border transition-colors ${
                      selected ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'
                    }`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{o.order_number || `#${o.id}`}</p>
                      <Badge variant={o.order_type}>{TYPE_LABELS[o.order_type] ?? o.order_type}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{o.vendor_name ?? t('dashboard.noVendor')}</p>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <Badge variant={o.status}>{STATUS_LABELS[o.status]}</Badge>
                      <span className="text-xs text-gray-400">{t('receiving.receivedOfOrdered', { received: o.qty_received_total, ordered: o.qty_ordered_total })} · {t('receiving.lineCount', { count: o.line_count })}</span>
                    </div>
                    {o.order_type === 'online' ? (
                      (o.expected_date || o.invoice_number) && (
                        <p className="text-xs text-gray-400 mt-1">
                          {o.expected_date ? t('dashboard.expectedOn', { date: formatDate(o.expected_date) }) : ''}
                          {o.expected_date && o.invoice_number ? ' · ' : ''}
                          {o.invoice_number ? t('receiving.invNumber', { number: o.invoice_number }) : ''}
                        </p>
                      )
                    ) : (
                      (o.purchased_by_name || o.receipt_number) && (
                        <p className="text-xs text-gray-400 mt-1">
                          {o.purchased_by_name ? t('receiving.boughtBy', { name: o.purchased_by_name }) : ''}
                          {o.purchased_by_name && o.receipt_number ? ' · ' : ''}
                          {o.receipt_number ? t('receiving.receiptNumber', { number: o.receipt_number }) : ''}
                        </p>
                      )
                    )}
                  </button>
                )
              })}

              <button type="button" onClick={() => { setOrderId(''); setFreeformMode(true) }}
                className={`text-left rounded-xl px-3 py-2 border border-dashed transition-colors ${
                  !orderId && freeformMode ? 'border-brand-400 bg-brand-50/60' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="text-xs font-medium text-gray-500">{t('receiving.cantFindOrder')}</p>
                <p className="text-xs text-gray-400">{t('receiving.freeformLastResort')}</p>
              </button>
            </div>
          </Card>
        </div>
      </div>

      {scannerOpen && (
        <Suspense fallback={<ScannerLoading />}>
          <BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={handleScan} />
        </Suspense>
      )}
    </div>
  )
}
