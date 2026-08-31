import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import TranslatableText from '../components/ui/TranslatableText'
import EstimateNumberField from '../components/ui/EstimateNumberField'
import LinkPreviewCard from '../components/ui/LinkPreviewCard'
import SearchSelect from '../components/ui/SearchSelect'
import Tag from '../components/ui/Tag'
import { listRequests, createRequest, resolveRequest, updateRequestReview, undoDeclineRequest, deleteRequest } from '../api/requests'
import { listOrders } from '../api/orders'
import { listVendors, createVendor } from '../api/vendors'
import { listItems, createItem } from '../api/items'
import { useBadgeStore } from '../store/badgeStore'
import { formatDateTime } from '../utils/format'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY = { description: '', qty_requested: '', unit_of_measure: '', notes: '', project_note: '', product_link: '' }

// Every request is for the same warehouse in practice (1200 Woodruff Rd.) —
// see api/requests/index.php, which resolves that automatically — so this
// isn't a per-ticket choice any more and there's no location field here.
const UNIT_OPTIONS = ['each', 'box', 'case', 'roll', 'gallon', 'bag', 'sheet', 'ft', 'yard', 'pallet', 'set', 'pair', 'tube', 'bundle']

// The "I need this ordered" ticket form — used for both the "+ New Request"
// modal and the "Edit Request" modal. Every request is a lead/admin tool
// now: the vendor to buy from, the catalog item it maps to, and the product
// link are all set right here (a request isn't "ready to order" until all
// three are filled in), alongside the optional project.
function RequestForm({
  form, set, error, saving, onSubmit, t, submitLabel,
  vendors, setVendors, items, setItems,
  vendorId, onVendorId, itemId, onItemId,
  onProjectResolved, initialProjectNumber = '', initialProjectName = '',
}) {
  const [vendorSearch, setVendorSearch] = useState('')
  const [creatingVendor, setCreatingVendor] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [showCreateItem, setShowCreateItem] = useState(false)
  const [newSku, setNewSku] = useState('')
  const [newName, setNewName] = useState('')
  const [creatingItem, setCreatingItem] = useState(false)

  const selectedVendor = vendors.find(v => String(v.id) === String(vendorId)) || null
  const vendorMatches = vendorSearch.trim()
    ? vendors.filter(v => v.name.toLowerCase().includes(vendorSearch.trim().toLowerCase()))
    : []
  const vendorExact = vendors.some(v => v.name.toLowerCase() === vendorSearch.trim().toLowerCase())
  const handleCreateVendor = async () => {
    const name = vendorSearch.trim()
    if (!name) return
    setCreatingVendor(true)
    try {
      const { id } = await createVendor({ name })
      const vendor = { id, name }
      setVendors(vs => [...vs, vendor])
      onVendorId(id)
      setVendorSearch('')
    } catch { /* toast handled by caller context is overkill here; surface inline */ }
    finally { setCreatingVendor(false) }
  }

  const selectedItem = items.find(it => String(it.id) === String(itemId)) || null
  const itemMatches = itemSearch.trim()
    ? items.filter(it => `${it.sku} ${it.name}`.toLowerCase().includes(itemSearch.trim().toLowerCase()))
    : []
  const itemExact = items.some(it => it.sku.toLowerCase() === itemSearch.trim().toLowerCase())
  const handleCreateItem = async () => {
    const sku = newSku.trim(), name = newName.trim()
    if (!sku || !name) return
    setCreatingItem(true)
    try {
      const { id } = await createItem({ sku, name })
      const item = { id, sku, name, unit_of_measure: 'each' }
      setItems(its => [...its, item])
      onItemId(id)
      setItemSearch(''); setShowCreateItem(false); setNewSku(''); setNewName('')
    } catch { /* surfaced via the disabled state / retry */ }
    finally { setCreatingItem(false) }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{t('requests.whatDoYouNeed')}</label>
        <textarea value={form.description} onChange={set('description')} rows={3}
          placeholder={t('requests.descriptionPlaceholder')}
          className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label={t('requests.qtyOptional')} type="number" step="0.01" min="0" value={form.qty_requested} onChange={set('qty_requested')} />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('requests.unitOptional')}</label>
          <select value={form.unit_of_measure} onChange={set('unit_of_measure')}
            className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">{t('common.none')}</option>
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{t(`requests.units.${u}`)}</option>)}
            {form.unit_of_measure && !UNIT_OPTIONS.includes(form.unit_of_measure) && (
              <option value={form.unit_of_measure}>{form.unit_of_measure}</option>
            )}
          </select>
        </div>
      </div>

      <Input label={t('requests.anythingElseOptional')} value={form.notes} onChange={set('notes')} />

      <div className="flex flex-col gap-4 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 -mb-1">{t('requests.reviewSectionTitle')}</p>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('requests.vendorLabel')}</label>
          <SearchSelect
            selected={selectedVendor ? { id: selectedVendor.id, label: selectedVendor.name } : null}
            onClear={() => onVendorId(null)}
            search={vendorSearch} onSearchChange={setVendorSearch}
            results={vendorMatches.map(v => ({ id: v.id, label: v.name }))}
            onPick={(r) => { onVendorId(r.id); setVendorSearch('') }}
            placeholder={t('requests.searchVendorPlaceholder')}
            renderCreate={vendorSearch.trim() && !vendorExact && (
              <Button type="button" variant="secondary" size="sm" loading={creatingVendor} onClick={handleCreateVendor} className="m-1 w-fit">
                {t('requests.createVendor', { name: vendorSearch.trim() })}
              </Button>
            )}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('requests.itemLabel')}</label>
          <SearchSelect
            selected={selectedItem ? { id: selectedItem.id, label: selectedItem.name, sublabel: selectedItem.sku } : null}
            onClear={() => onItemId(null)}
            search={itemSearch} onSearchChange={setItemSearch}
            results={itemMatches.map(it => ({ id: it.id, label: it.name, sublabel: it.sku }))}
            onPick={(r) => { onItemId(r.id); setItemSearch('') }}
            placeholder={t('requests.searchItemPlaceholder')}
            renderCreate={itemSearch.trim() && !itemExact && (
              showCreateItem ? (
                <div className="flex flex-col gap-1.5 p-1">
                  <input type="text" placeholder={t('common.sku')} value={newSku} onChange={(e) => setNewSku(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500" />
                  <input type="text" placeholder={t('common.name')} value={newName} onChange={(e) => setNewName(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500" />
                  <Button type="button" variant="secondary" size="sm" loading={creatingItem}
                    disabled={!newSku.trim() || !newName.trim()} onClick={handleCreateItem} className="w-fit">
                    {t('orders.createAndUse')}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="secondary" size="sm"
                  onClick={() => { setShowCreateItem(true); setNewName(itemSearch.trim()) }} className="m-1 w-fit">
                  {t('orders.createNewItem', { name: itemSearch.trim() })}
                </Button>
              )
            )}
          />
        </div>

        <EstimateNumberField label={t('requests.projectOptional')}
          initialNumber={initialProjectNumber} initialName={initialProjectName}
          onResolved={onProjectResolved} helperText={t('requests.projectHelper')} />
        <Input label={t('requests.projectNoteOptional')} placeholder={t('requests.projectNotePlaceholder')}
          value={form.project_note} onChange={set('project_note')} helperText={t('requests.projectNoteHelper')} />
        <div className="flex flex-col gap-1.5">
          <Input label={t('requests.productLinkLabel')} type="url" placeholder={t('requests.productLinkPlaceholder')}
            value={form.product_link} onChange={set('product_link')} />
          <LinkPreviewCard url={form.product_link} />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button type="submit" loading={saving} fullWidth>{submitLabel ?? t('requests.submitRequest')}</Button>
    </form>
  )
}

export default function Requests() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const refreshBadges = useBadgeStore((s) => s.refresh)

  const STATUS_LABELS = {
    open: t('requests.status.open'), ordered: t('requests.status.ordered'), declined: t('requests.status.declined'),
  }

  const [requests, setRequests] = useState([])
  const [orders, setOrders] = useState([])
  const [vendors, setVendors] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open') // 'open' | 'ordered' | 'declined' | 'all'

  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [newVendorId, setNewVendorId] = useState(null)
  const [newItemId, setNewItemId] = useState(null)
  const [newProjectId, setNewProjectId] = useState(null)

  const [decliningId, setDecliningId] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [linkingId, setLinkingId] = useState(null)
  const [linkOrderId, setLinkOrderId] = useState('')
  const [actingId, setActingId] = useState(null)

  // "Edit Request" modal — every ticket field, editable independent of status.
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY)
  const [editVendorId, setEditVendorId] = useState(null)
  const [editItemId, setEditItemId] = useState(null)
  const [editProjectId, setEditProjectId] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const load = () => {
    setLoading(true)
    listRequests(tab !== 'all' ? { status: tab } : {})
      .then(d => setRequests(d.requests ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listOrders().then(d => setOrders(d.orders ?? []))
    listVendors({ active: 1 }).then(d => setVendors(d.vendors ?? []))
    listItems({ active: 1 }).then(d => setItems(d.items ?? []))
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setEdit = (k) => (e) => setEditForm(f => ({ ...f, [k]: e.target.value }))

  // Vendor + catalog item + a valid product link are what make a request
  // "ready to order" — enforce all three here, not just server-side.
  const validateReview = (f, vId, iId) => {
    if (!f.description.trim()) return t('requests.describeWhatYouNeed')
    if (!vId) return t('requests.vendorRequired')
    if (!iId) return t('requests.itemRequired')
    const link = f.product_link.trim()
    if (!link || !/^https?:\/\//i.test(link)) return t('requests.productLinkRequired')
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const msg = validateReview(form, newVendorId, newItemId)
    if (msg) { setError(msg); return }
    setSaving(true); setError('')
    try {
      await createRequest({
        description: form.description.trim(),
        qty_requested: form.qty_requested || null,
        unit_of_measure: form.unit_of_measure || null,
        notes: form.notes || null,
        vendor_id: newVendorId,
        item_id: newItemId,
        project_id: newProjectId || null,
        project_note: form.project_note.trim() || null,
        product_link: form.product_link.trim() || null,
      })
      toast.success(t('requests.submitted'))
      setForm(EMPTY)
      setNewVendorId(null); setNewItemId(null); setNewProjectId(null)
      setModalOpen(false)
      if (tab !== 'open' && tab !== 'all') setTab('open')
      else load()
      refreshBadges(true)
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const startDecline  = (id) => { setDecliningId(id); setDeclineReason('') }
  const cancelDecline = () => { setDecliningId(null); setDeclineReason('') }
  const confirmDecline = async (id) => {
    setActingId(id)
    try { await resolveRequest(id, { status: 'declined', decline_reason: declineReason.trim() || null }); setDecliningId(null); load(); refreshBadges(true) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  const startLink  = (id) => { setLinkingId(id); setLinkOrderId('') }
  const cancelLink = () => { setLinkingId(null); setLinkOrderId('') }
  const confirmLink = async (id) => {
    if (!linkOrderId) return
    setActingId(id)
    try { await resolveRequest(id, { status: 'ordered', order_id: linkOrderId }); setLinkingId(null); load(); refreshBadges(true) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  const startEdit = (r) => {
    setEditing(r)
    setEditForm({
      description: r.description ?? '',
      qty_requested: r.qty_requested ?? '',
      unit_of_measure: r.unit_of_measure ?? '',
      notes: r.notes ?? '',
      project_note: r.project_note ?? '',
      product_link: r.product_link ?? '',
    })
    setEditVendorId(r.vendor_id ?? null)
    setEditItemId(r.item_id ?? null)
    setEditProjectId(r.project_id ?? null)
    setEditError('')
  }
  const handleEditSubmit = async (e) => {
    e.preventDefault()
    const msg = validateReview(editForm, editVendorId, editItemId)
    if (msg) { setEditError(msg); return }
    setEditSaving(true); setEditError('')
    try {
      await updateRequestReview(editing.id, {
        description: editForm.description.trim(),
        qty_requested: editForm.qty_requested || null,
        unit_of_measure: editForm.unit_of_measure || null,
        notes: editForm.notes || null,
        project_note: editForm.project_note.trim() || null,
        product_link: editForm.product_link.trim() || null,
        vendor_id: editVendorId,
        item_id: editItemId,
        project_id: editProjectId || null,
      })
      toast.success(t('requests.detailsSaved'))
      setEditing(null)
      load(); refreshBadges(true)
    } catch (err) { setEditError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setEditSaving(false) }
  }

  const handleUndoDecline = async (r) => {
    setActingId(r.id)
    try {
      await undoDeclineRequest(r.id)
      toast.success(t('requests.declineUndone'))
      load(); refreshBadges(true)
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  const handleDeleteRequest = async (r) => {
    if (!await confirmDialog(t('requests.cancelConfirm'), { danger: true, confirmLabel: t('common.delete') })) return
    try { await deleteRequest(r.id); load(); refreshBadges(true) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const badgeVariant = { open: 'request_open', ordered: 'request_ordered', declined: 'request_declined' }

  const RequestCard = ({ r }) => (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{r.requested_by_name ?? t('requests.unknownRequester')}</p>
          <p className="text-xs text-gray-500">{formatDateTime(r.created_at)}</p>
        </div>
        <Badge variant={badgeVariant[r.status]}>{STATUS_LABELS[r.status]}</Badge>
      </div>

      <TranslatableText text={r.description} className="text-sm text-gray-900" />

      <div className="flex flex-wrap gap-1.5">
        {r.qty_requested != null && <Tag>{t('requests.qtyLabel', { qty: r.qty_requested, unit: r.unit_of_measure || '' })}</Tag>}
        {r.vendor_name && <Tag tone="blue">{t('requests.vendorTag', { vendor: r.vendor_name })}</Tag>}
        {r.item_sku && <Tag>{r.item_sku} — {r.item_name}</Tag>}
        {r.project_number && <Tag tone="brand">{t('requests.projectLabel', { number: r.project_number, name: r.project_name })}</Tag>}
      </div>
      {r.project_note && <p className="text-xs font-medium text-gray-600">{t('requests.projectNoteLabel', { note: r.project_note })}</p>}
      {r.notes && <TranslatableText text={r.notes} className="text-xs text-gray-600 italic" />}
      {r.product_link && <LinkPreviewCard url={r.product_link} />}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => startEdit(r)} className="w-fit">
          {t('requests.editRequest')}
        </Button>
        {r.status === 'open' && (
          <button type="button" onClick={() => handleDeleteRequest(r)}
            className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors">
            {t('requests.cancelRequest')}
          </button>
        )}
      </div>

      {r.status === 'ordered' && r.order_number && (
        <p className="text-xs font-semibold text-brand-700">{t('requests.orderedAs', { order: r.order_number })}</p>
      )}
      {r.status === 'declined' && (
        <div className="text-xs text-gray-600 flex items-start justify-between gap-2">
          <div>
            <p>{t('requests.declinedBy', { name: r.resolved_by_name ?? '—' })}</p>
            {r.decline_reason && <TranslatableText text={r.decline_reason} className="text-gray-600 italic mt-0.5" />}
          </div>
          <Button size="sm" variant="secondary" onClick={() => handleUndoDecline(r)} loading={actingId === r.id} className="shrink-0">
            {t('requests.undoDecline')}
          </Button>
        </div>
      )}

      {r.status === 'open' && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 mt-1">
          {decliningId === r.id ? (
            <div className="flex flex-col gap-2">
              <input type="text" placeholder={t('requests.declineReasonPlaceholder')} value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:border-brand-500" />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" loading={actingId === r.id} onClick={() => confirmDecline(r.id)}>{t('requests.confirmDecline')}</Button>
                <Button size="sm" variant="secondary" onClick={cancelDecline}>{t('common.cancel')}</Button>
              </div>
            </div>
          ) : linkingId === r.id ? (
            <div className="flex flex-col gap-2">
              <select value={linkOrderId} onChange={(e) => setLinkOrderId(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-brand-500">
                <option value="">{t('requests.pickAnOrder')}</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.order_number || `#${o.id}`} — {o.vendor_name ?? t('dashboard.noVendor')}</option>)}
              </select>
              <div className="flex gap-2">
                <Button size="sm" loading={actingId === r.id} disabled={!linkOrderId} onClick={() => confirmLink(r.id)}>{t('requests.confirmLink')}</Button>
                <Button size="sm" variant="secondary" onClick={cancelLink}>{t('common.cancel')}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {orders.length > 0 && <Button size="sm" variant="secondary" onClick={() => startLink(r.id)}>{t('requests.linkExistingOrder')}</Button>}
              <button type="button" onClick={() => startDecline(r.id)}
                className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors">
                {t('requests.decline')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="w-full">
      <PageHeader title={t('requests.title')} subtitle={t('requests.subtitleLead')}
        actions={
          <Button onClick={() => { setForm(EMPTY); setNewVendorId(null); setNewItemId(null); setNewProjectId(null); setError(''); setModalOpen(true) }}>
            {t('requests.newRequest')}
          </Button>
        } />

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['open', t('requests.tabOpen')], ['ordered', t('requests.tabOrdered')], ['declined', t('requests.tabDeclined')], ['all', t('orders.tabAll')]].map(([val, label]) => (
          <button key={val} type="button" onClick={() => setTab(val)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === val ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : requests.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 py-8 text-center">{t('requests.noneInTab')}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map(r => <RequestCard key={r.id} r={r} />)}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('requests.newRequest')}>
        <RequestForm form={form} set={set} error={error} saving={saving} onSubmit={handleSubmit} t={t}
          vendors={vendors} setVendors={setVendors} items={items} setItems={setItems}
          vendorId={newVendorId} onVendorId={setNewVendorId} itemId={newItemId} onItemId={setNewItemId}
          onProjectResolved={(project) => setNewProjectId(project ? project.id : null)} />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={t('requests.editRequest')}>
        {editing && (
          <RequestForm form={editForm} set={setEdit} error={editError} saving={editSaving} onSubmit={handleEditSubmit} t={t}
            vendors={vendors} setVendors={setVendors} items={items} setItems={setItems}
            vendorId={editVendorId} onVendorId={setEditVendorId} itemId={editItemId} onItemId={setEditItemId}
            initialProjectNumber={editing.project_number ?? ''} initialProjectName={editing.project_name ?? ''}
            onProjectResolved={(project) => setEditProjectId(project ? project.id : null)}
            submitLabel={t('requests.saveChanges')} />
        )}
      </Modal>
    </div>
  )
}
