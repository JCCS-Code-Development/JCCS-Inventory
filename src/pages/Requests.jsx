import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { listRequests, createRequest, resolveRequest, updateRequestReview, undoDeclineRequest, deleteRequest } from '../api/requests'
import { listOrders } from '../api/orders'
import { listLocations } from '../api/locations'
import { useAuthStore } from '../store/authStore'
import { useBadgeStore } from '../store/badgeStore'
import { formatDateTime } from '../utils/format'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY = { description: '', qty_requested: '', unit_of_measure: '', vendor_hint: '', location_id: '', notes: '', project_note: '', product_link: '' }

// The "I need this ordered" ticket form — shared between the worker's own
// page, the Inventory Lead's "+ New Request" modal, and the Lead's "Edit
// Request" modal for an existing ticket. `showReviewFields` only ever comes
// in true for the Lead — the project (+ a plain-language note about which
// job it's for, in case the Estimate # itself isn't confirmed yet) and
// product link are what get pinned down while the Lead and requester sit
// down together, so a plain worker never sees them here.
function RequestForm({
  form, set, locations, error, saving, onSubmit, t, showReviewFields, onProjectResolved,
  initialProjectNumber = '', initialProjectName = '', submitLabel,
}) {
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
        <Input label={t('requests.unitOptional')} placeholder={t('requests.unitPlaceholder')} value={form.unit_of_measure} onChange={set('unit_of_measure')} />
      </div>

      <Input label={t('requests.vendorHintOptional')} placeholder={t('requests.vendorHintPlaceholder')} value={form.vendor_hint} onChange={set('vendor_hint')} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{t('requests.whereNeededOptional')}</label>
        <select value={form.location_id} onChange={set('location_id')}
          className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          <option value="">{t('common.none')}</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <Input label={t('requests.anythingElseOptional')} value={form.notes} onChange={set('notes')} />

      {showReviewFields && (
        <div className="flex flex-col gap-4 pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 -mb-1">{t('requests.reviewSectionTitle')}</p>
          <EstimateNumberField label={t('requests.projectOptional')}
            initialNumber={initialProjectNumber} initialName={initialProjectName}
            onResolved={onProjectResolved} helperText={t('requests.projectHelper')} />
          <Input label={t('requests.projectNoteOptional')} placeholder={t('requests.projectNotePlaceholder')}
            value={form.project_note} onChange={set('project_note')} helperText={t('requests.projectNoteHelper')} />
          <Input label={t('requests.productLinkOptional')} type="url" placeholder={t('requests.productLinkPlaceholder')}
            value={form.product_link} onChange={set('product_link')} />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button type="submit" loading={saving} fullWidth>{submitLabel ?? t('requests.submitRequest')}</Button>
    </form>
  )
}

export default function Requests() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const isLead = role === 'specialist' || role === 'admin'
  const confirmDialog = useConfirm()
  const toast = useToast()
  const refreshBadges = useBadgeStore((s) => s.refresh) // no-ops for a basic user's own session

  const STATUS_LABELS = {
    open: t('requests.status.open'), ordered: t('requests.status.ordered'), declined: t('requests.status.declined'),
  }

  const [requests, setRequests] = useState([])
  const [orders, setOrders] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open') // lead only: 'open' | 'ordered' | 'declined' | 'all'

  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false) // lead's "+ New Request" modal

  const [decliningId, setDecliningId] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [linkingId, setLinkingId] = useState(null)
  const [linkOrderId, setLinkOrderId] = useState('')
  const [actingId, setActingId] = useState(null)

  // The resolved project id for the create form (worker page never renders
  // this field, so it stays unused there) — separate from `form` because
  // EstimateNumberField reports the resolved project object, not a plain value.
  const [newRequestProjectId, setNewRequestProjectId] = useState(null)

  // Lead's "Edit Request" modal — every ticket field, editable independent
  // of status. `editing` is the full request row being edited, or null.
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY)
  const [editProjectId, setEditProjectId] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const load = () => {
    setLoading(true)
    listRequests(isLead && tab !== 'all' ? { status: tab } : {})
      .then(d => setRequests(d.requests ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listLocations({ active: 1 }).then(d => setLocations(d.locations ?? []))
    if (isLead) listOrders().then(d => setOrders(d.orders ?? []))
  }, [isLead])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.description.trim()) { setError(t('requests.describeWhatYouNeed')); return }
    setSaving(true); setError('')
    try {
      await createRequest({
        description: form.description.trim(),
        qty_requested: form.qty_requested || null,
        unit_of_measure: form.unit_of_measure || null,
        vendor_hint: form.vendor_hint || null,
        location_id: form.location_id || null,
        notes: form.notes || null,
        ...(isLead ? {
          project_id: newRequestProjectId || null,
          project_note: form.project_note.trim() || null,
          product_link: form.product_link.trim() || null,
        } : {}),
      })
      toast.success(t('requests.submitted'))
      setForm(EMPTY)
      setNewRequestProjectId(null)
      setModalOpen(false)
      if (isLead && tab !== 'open' && tab !== 'all') setTab('open')
      else load()
      refreshBadges(isLead)
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleCancel = async (r) => {
    if (!await confirmDialog(t('requests.cancelConfirm'), { danger: true, confirmLabel: t('common.delete') })) return
    try { await deleteRequest(r.id); load(); refreshBadges(isLead) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const handleCreateOrder = (r) => navigate('/orders', { state: { fromRequest: r } })

  const startDecline  = (id) => { setDecliningId(id); setDeclineReason('') }
  const cancelDecline = () => { setDecliningId(null); setDeclineReason('') }
  const confirmDecline = async (id) => {
    setActingId(id)
    try { await resolveRequest(id, { status: 'declined', decline_reason: declineReason.trim() || null }); setDecliningId(null); load(); refreshBadges(isLead) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  const startLink  = (id) => { setLinkingId(id); setLinkOrderId('') }
  const cancelLink = () => { setLinkingId(null); setLinkOrderId('') }
  const confirmLink = async (id) => {
    if (!linkOrderId) return
    setActingId(id)
    try { await resolveRequest(id, { status: 'ordered', order_id: linkOrderId }); setLinkingId(null); load(); refreshBadges(isLead) }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  const startEdit = (r) => {
    setEditing(r)
    setEditForm({
      description: r.description ?? '',
      qty_requested: r.qty_requested ?? '',
      unit_of_measure: r.unit_of_measure ?? '',
      vendor_hint: r.vendor_hint ?? '',
      location_id: r.location_id ? String(r.location_id) : '',
      notes: r.notes ?? '',
      project_note: r.project_note ?? '',
      product_link: r.product_link ?? '',
    })
    setEditProjectId(r.project_id ?? null)
    setEditError('')
  }
  const setEdit = (k) => (e) => setEditForm(f => ({ ...f, [k]: e.target.value }))
  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editForm.description.trim()) { setEditError(t('requests.describeWhatYouNeed')); return }
    setEditSaving(true); setEditError('')
    try {
      await updateRequestReview(editing.id, {
        description: editForm.description.trim(),
        qty_requested: editForm.qty_requested || null,
        unit_of_measure: editForm.unit_of_measure || null,
        vendor_hint: editForm.vendor_hint || null,
        location_id: editForm.location_id || null,
        notes: editForm.notes || null,
        project_note: editForm.project_note.trim() || null,
        product_link: editForm.product_link.trim() || null,
        project_id: editProjectId || null,
      })
      toast.success(t('requests.detailsSaved'))
      setEditing(null)
      load()
    } catch (err) { setEditError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setEditSaving(false) }
  }

  const handleUndoDecline = async (r) => {
    setActingId(r.id)
    try {
      await undoDeclineRequest(r.id)
      toast.success(t('requests.declineUndone'))
      load()
      refreshBadges(isLead)
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  const badgeVariant = { open: 'request_open', ordered: 'request_ordered', declined: 'request_declined' }

  const RequestCard = ({ r }) => (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {isLead && <p className="text-sm font-semibold text-gray-900">{r.requested_by_name ?? t('requests.unknownRequester')}</p>}
          <p className="text-xs text-gray-400">{formatDateTime(r.created_at)}</p>
        </div>
        <Badge variant={badgeVariant[r.status]}>{STATUS_LABELS[r.status]}</Badge>
      </div>

      <TranslatableText text={r.description} className="text-sm text-gray-800" />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {r.qty_requested != null && <span>{t('requests.qtyLabel', { qty: r.qty_requested, unit: r.unit_of_measure || '' })}</span>}
        {r.vendor_hint && <span>{t('requests.vendorHintLabel', { vendor: r.vendor_hint })}</span>}
        {r.location_name && <span>{t('requests.neededAtLabel', { location: r.location_name })}</span>}
        {r.project_number && <span>{t('requests.projectLabel', { number: r.project_number, name: r.project_name })}</span>}
      </div>
      {r.project_note && <p className="text-xs text-gray-500">{t('requests.projectNoteLabel', { note: r.project_note })}</p>}
      {r.notes && <TranslatableText text={r.notes} className="text-xs text-gray-400 italic" />}
      {r.product_link && (
        <a href={r.product_link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-600 hover:underline w-fit">
          {t('requests.viewProductLink')}
        </a>
      )}

      {isLead && (
        <button type="button" onClick={() => startEdit(r)} className="text-xs font-semibold text-gray-400 hover:text-brand-600 w-fit">
          {t('requests.editRequest')}
        </button>
      )}

      {r.status === 'ordered' && r.order_number && (
        <p className="text-xs font-semibold text-brand-700">{t('requests.orderedAs', { order: r.order_number })}</p>
      )}
      {r.status === 'declined' && (
        <div className="text-xs text-gray-500 flex items-start justify-between gap-2">
          <div>
            <p>{t('requests.declinedBy', { name: r.resolved_by_name ?? '—' })}</p>
            {r.decline_reason && <TranslatableText text={r.decline_reason} className="text-gray-500 italic mt-0.5" />}
          </div>
          {isLead && (
            <button type="button" onClick={() => handleUndoDecline(r)} disabled={actingId === r.id}
              className="text-xs font-semibold text-gray-400 hover:text-brand-600 shrink-0 disabled:opacity-50">
              {t('requests.undoDecline')}
            </button>
          )}
        </div>
      )}

      {r.status === 'open' && !isLead && (
        <button type="button" onClick={() => handleCancel(r)} className="text-xs font-semibold text-red-500 hover:underline w-fit">
          {t('requests.cancelRequest')}
        </button>
      )}

      {r.status === 'open' && isLead && (
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-100 mt-1">
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
              <Button size="sm" onClick={() => handleCreateOrder(r)}>{t('requests.createOrder')}</Button>
              {orders.length > 0 && <Button size="sm" variant="secondary" onClick={() => startLink(r.id)}>{t('requests.linkExistingOrder')}</Button>}
              <button type="button" onClick={() => startDecline(r.id)} className="text-xs font-semibold text-gray-400 hover:text-red-500 px-2">{t('requests.decline')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="w-full">
      <PageHeader title={t('requests.title')} subtitle={t(isLead ? 'requests.subtitleLead' : 'requests.subtitleWorker')}
        actions={isLead && <Button onClick={() => { setForm(EMPTY); setNewRequestProjectId(null); setError(''); setModalOpen(true) }}>{t('requests.newRequest')}</Button>} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,26rem)_1fr] gap-6 items-start">
        {!isLead && (
          <Card title={t('requests.whatDoYouNeed')}>
            <RequestForm form={form} set={set} locations={locations} error={error} saving={saving} onSubmit={handleSubmit} t={t} />
          </Card>
        )}

        <div className={isLead ? 'lg:col-span-2' : ''}>
          {isLead && (
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
          )}

          {!isLead && <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('requests.myRequests')}</h2>}

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : requests.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-400 py-8 text-center">
                {isLead ? t('requests.noneInTab') : t('requests.noneYet')}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {requests.map(r => <RequestCard key={r.id} r={r} />)}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('requests.newRequest')}>
        <RequestForm form={form} set={set} locations={locations} error={error} saving={saving} onSubmit={handleSubmit} t={t}
          showReviewFields={isLead} onProjectResolved={(project) => setNewRequestProjectId(project ? project.id : null)} />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={t('requests.editRequest')}>
        {editing && (
          <RequestForm form={editForm} set={setEdit} locations={locations} error={editError} saving={editSaving} onSubmit={handleEditSubmit} t={t}
            showReviewFields initialProjectNumber={editing.project_number ?? ''} initialProjectName={editing.project_name ?? ''}
            onProjectResolved={(project) => setEditProjectId(project ? project.id : null)}
            submitLabel={t('requests.saveChanges')} />
        )}
      </Modal>
    </div>
  )
}
