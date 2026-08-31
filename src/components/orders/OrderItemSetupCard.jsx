import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Badge from '../ui/Badge'
import Spinner from '../ui/Spinner'
import { getOrder, confirmOrderItem, unconfirmOrderItem, setOrderLineItem } from '../../api/orders'
import { updateItem } from '../../api/items'
import { listMaterials, createMaterial } from '../../api/materials'
import { createCategory } from '../../api/categories'
import { translateCategoryName, translateMaterialName } from '../../utils/catalogNames'
import { formatDateTime } from '../../utils/format'
import { useToast } from '../ToastProvider'

const STOP = new Set(['the', 'and', 'for', 'with', 'box', 'set', 'pack', 'pk', 'ea', 'each', 'of', 'in', 'x', 'a'])
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))

// One order that's sitting in the "Item Setup" stage. Pulls its own detail so
// each card refreshes independently as its lines get confirmed; calls
// onOrderChanged() after any change so the parent can drop the card / refresh
// counts once the whole order is confirmed and promoted to 'placed'.
export default function OrderItemSetupCard({ order, categories, allItems, onCategoryCreated, onOrderChanged }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = () =>
    getOrder(order.id).then(d => { setDetail(d); return d }).finally(() => setLoading(false))
  useEffect(() => { reload() }, [order.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !detail) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-6 flex justify-center"><Spinner /></div>
  }

  const lines = detail.items ?? []
  const done = lines.filter(l => l.item_confirmed_at).length

  const handleLineChanged = async () => {
    const fresh = await reload()
    // Every line confirmed -> the API has flipped the order to 'placed'.
    if (fresh.status !== 'awaiting_item_setup') {
      toast.success(t('orders.orderReadyToReceive', { order: fresh.order_number || `#${fresh.id}` }))
    }
    onOrderChanged?.()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {detail.order_number || `#${detail.id}`}
            <span className="ml-2 text-xs font-normal text-gray-500">{detail.vendor_name ?? t('dashboard.noVendor')}</span>
          </p>
          <p className="text-xs text-gray-400">
            {detail.order_type === 'dropoff'
              ? t('orders.receiptHashLabel') + ' ' + (detail.receipt_number ?? '—')
              : t('orders.invoiceHashLabel') + ' ' + (detail.invoice_number ?? '—')}
            {detail.attachment_url && (
              <> · <a href={detail.attachment_url} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:underline">
                {detail.order_type === 'dropoff' ? t('orders.viewReceipt') : t('orders.viewInvoice')}
              </a></>
            )}
          </p>
        </div>
        <Badge variant={done === lines.length ? 'in_stock' : 'partially_received'}>
          {t('orders.linesConfirmed', { done, total: lines.length })}
        </Badge>
      </div>

      <div className="border-t border-gray-100 flex flex-col gap-3 p-4">
        {lines.map(line => (
          <LineSetupRow key={line.id} line={line} categories={categories} allItems={allItems}
            onCategoryCreated={onCategoryCreated} onChanged={handleLineChanged} />
        ))}
      </div>
    </div>
  )
}

function LineSetupRow({ line, categories, allItems, onCategoryCreated, onChanged }) {
  const { t } = useTranslation()
  const toast = useToast()

  const seed = () => ({
    name: line.item_name ?? '', sku: line.sku ?? '',
    category_id: line.category_id ? String(line.category_id) : '',
    material_id: line.material_id ? String(line.material_id) : '',
    unit_of_measure: line.unit_of_measure ?? 'each',
    unit_cost: line.unit_cost != null ? String(line.unit_cost) : '',
    vendor_item_number: line.vendor_item_number ?? '',
    dimensions: line.dimensions ?? '',
    reorder_point: line.reorder_point != null ? String(line.reorder_point) : '',
  })
  const [form, setForm] = useState(seed)
  const [baseline, setBaseline] = useState(seed)
  const [materials, setMaterials] = useState([])
  const [showMore, setShowMore] = useState(false)
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [showNewMat, setShowNewMat] = useState(false)
  const [newMat, setNewMat] = useState('')
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)

  // Re-seed when the parent hands us a fresh line (e.g. after repointing).
  useEffect(() => { const s = seed(); setForm(s); setBaseline(s) }, [line.id, line.item_id, line.item_name, line.sku, line.category_id, line.material_id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!form.category_id) { setMaterials([]); return }
    listMaterials(form.category_id).then(d => setMaterials(d.materials ?? [])).catch(() => setMaterials([]))
  }, [form.category_id])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const confirmed = !!line.item_confirmed_at
  const missing = !form.name.trim() || !form.sku.trim() || !form.category_id

  // Other active catalog items with a name that overlaps this one — a likely
  // duplicate the Lead should point the line at instead of registering anew.
  const dupes = (() => {
    const mine = new Set(tokens(form.name))
    if (mine.size === 0) return []
    return allItems
      .filter(it => it.id !== line.item_id && it.is_active !== 0)
      .map(it => ({ it, overlap: tokens(it.name).filter(w => mine.has(w)).length }))
      .filter(x => x.overlap >= 2)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map(x => x.it)
  })()

  const handleSaveItem = async () => {
    if (!form.name.trim() || !form.sku.trim()) { toast.error(t('items.skuNameRequired')); return }
    setSaving(true)
    try {
      await updateItem(line.item_id, {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category_id: form.category_id || null,
        material_id: form.material_id || null,
        unit_of_measure: form.unit_of_measure || 'each',
        unit_cost: form.unit_cost !== '' ? parseFloat(form.unit_cost) : null,
        vendor_item_number: form.vendor_item_number || null,
        dimensions: form.dimensions || null,
        reorder_point: form.reorder_point !== '' ? parseInt(form.reorder_point, 10) : null,
      })
      setBaseline(form)
      toast.success(t('items.saved'))
      onChanged?.()
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setSaving(false) }
  }

  const handleAddCategory = async () => {
    const name = newCat.trim()
    if (!name) return
    try {
      const { id } = await createCategory({ name })
      onCategoryCreated?.({ id, name })
      setForm(f => ({ ...f, category_id: String(id), material_id: '' }))
      setShowNewCat(false); setNewCat('')
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }
  const handleAddMaterial = async () => {
    const name = newMat.trim()
    if (!name || !form.category_id) return
    try {
      const { material } = await createMaterial({ category_id: form.category_id, name })
      setMaterials(ms => [...ms, material])
      setForm(f => ({ ...f, material_id: String(material.id) }))
      setShowNewMat(false); setNewMat('')
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const handleConfirm = async () => {
    setActing(true)
    try { await confirmOrderItem(line.id); onChanged?.() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActing(false) }
  }
  const handleUndo = async () => {
    setActing(true)
    try { await unconfirmOrderItem(line.id); onChanged?.() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActing(false) }
  }
  const handleUseInstead = async (it) => {
    setActing(true)
    try {
      await setOrderLineItem(line.id, it.id)
      toast.success(t('orders.linePointedAt', { name: it.name }))
      onChanged?.()
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActing(false) }
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-green-100 bg-green-50/50 p-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{line.sku} — {line.item_name}</p>
          <p className="text-xs text-gray-500">
            {line.category_name ?? '—'} · {t('orders.confirmedBy', { name: line.item_confirmed_by_name ?? '—', date: formatDateTime(line.item_confirmed_at) })}
          </p>
        </div>
        <Button size="sm" variant="secondary" loading={acting} onClick={handleUndo} className="shrink-0">{t('orders.undoConfirm')}</Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500">
          {t('orders.colOrdered')}: {line.qty_ordered} {line.unit_of_measure}
        </p>
        {missing && <span className="text-xs font-semibold text-red-500">{t('orders.itemNeedsCategory')}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('common.name')} value={form.name} onChange={set('name')} placeholder={t('items.namePlaceholder')} />
        <Input label={t('items.skuPartNumber')} value={form.sku} onChange={set('sku')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">{t('items.category')}</label>
            {!showNewCat && <button type="button" onClick={() => setShowNewCat(true)} className="text-xs font-semibold text-brand-500">{t('common.addNew')}</button>}
          </div>
          <select value={form.category_id} onChange={(e) => setForm(f => ({ ...f, category_id: e.target.value, material_id: '' }))}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500">
            <option value="">{t('common.none')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{translateCategoryName(c.name, t)}</option>)}
          </select>
          {showNewCat && (
            <div className="flex gap-2 mt-1">
              <Input placeholder={t('items.newCategoryPlaceholder')} value={newCat} onChange={(e) => setNewCat(e.target.value)} className="flex-1 min-w-0" />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddCategory}>{t('common.add')}</Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">{t('items.material')}</label>
            {form.category_id && !showNewMat && <button type="button" onClick={() => setShowNewMat(true)} className="text-xs font-semibold text-brand-500">{t('common.addNew')}</button>}
          </div>
          <select value={form.material_id} onChange={set('material_id')} disabled={!form.category_id}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400">
            <option value="">{form.category_id ? t('common.none') : t('items.pickCategory')}</option>
            {materials.map(m => <option key={m.id} value={m.id}>{translateMaterialName(m.name, t)}</option>)}
          </select>
          {showNewMat && (
            <div className="flex gap-2 mt-1">
              <Input placeholder={t('items.newMaterialPlaceholder')} value={newMat} onChange={(e) => setNewMat(e.target.value)} className="flex-1 min-w-0" />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddMaterial}>{t('common.add')}</Button>
            </div>
          )}
        </div>
      </div>

      {!showMore ? (
        <button type="button" onClick={() => setShowMore(true)} className="text-xs font-semibold text-brand-500 w-fit">{t('items.moreDetails')}</button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('items.unitOfMeasure')} value={form.unit_of_measure} onChange={set('unit_of_measure')} placeholder={t('items.unitPlaceholder')} />
          <Input label={t('items.unitCost')} type="number" step="0.01" min="0" value={form.unit_cost} onChange={set('unit_cost')} />
          <Input label={t('items.vendorItemNumber')} value={form.vendor_item_number} onChange={set('vendor_item_number')} placeholder={t('items.vendorItemPlaceholder')} />
          <Input label={t('items.dimensions')} value={form.dimensions} onChange={set('dimensions')} placeholder={t('items.dimensionsPlaceholder')} />
          <Input label={t('items.reorderPoint')} type="number" min="0" value={form.reorder_point} onChange={set('reorder_point')} />
        </div>
      )}

      {dupes.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-amber-800">{t('orders.possibleDuplicate')}</p>
          <div className="flex flex-wrap gap-1.5">
            {dupes.map(it => (
              <button key={it.id} type="button" onClick={() => handleUseInstead(it)} disabled={acting}
                className="text-xs font-medium rounded-full border border-amber-300 bg-white px-2.5 py-1 hover:bg-amber-100 disabled:opacity-50">
                {it.sku} — {it.name} · <span className="text-amber-700">{t('orders.useThisInstead')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {dirty && <Button size="sm" variant="secondary" loading={saving} onClick={handleSaveItem}>{t('common.save')}</Button>}
        <Button size="sm" loading={acting} disabled={dirty || missing} onClick={handleConfirm}>{t('orders.confirmItem')}</Button>
        {dirty && <span className="text-xs text-gray-400 self-center">{t('orders.saveBeforeConfirm')}</span>}
      </div>
    </div>
  )
}
