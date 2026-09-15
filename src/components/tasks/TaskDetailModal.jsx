import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Badge from '../ui/Badge'
import Spinner from '../ui/Spinner'
import Tag from '../ui/Tag'
import TranslatableText from '../ui/TranslatableText'
import {
  getTask, claimTask, toggleChecklistItem, updateTask, setTaskStatus,
  uploadTaskPhoto, deleteTaskAttachment,
} from '../../api/tasks'
import { useAuthStore } from '../../store/authStore'
import { compressImage } from '../../utils/compressImage'
import { formatDateTime } from '../../utils/format'
import { useToast } from '../ToastProvider'

const STATUS_BADGE = {
  to_do: 'active', in_progress: 'checkout', waiting_approval: 'partially_received',
  waiting_delivery: 'partially_received', blocked: 'low_stock', completed: 'in_stock', canceled: 'cancelled',
}

// The one place all task work happens: check off the checklist, add notes/
// qty/photos, and move it forward. Every action re-fetches the task so the
// checklist/attachment/history counts the dashboard cards show stay correct
// the moment this modal closes.
export default function TaskDetailModal({ taskId, onClose, onChanged }) {
  const { t } = useTranslation()
  const toast = useToast()
  const userId = useAuthStore((s) => s.user?.id)
  const role = useAuthStore((s) => s.user?.role)
  const isManager = role === 'admin' || role === 'specialist'
  const fileInputRef = useRef(null)

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // The "waiting_approval / waiting_delivery / blocked" mini-form — these
  // three always require an explanation + a follow-up date, enforced
  // server-side too (api/tasks/item.php).
  const [pendingStatus, setPendingStatus] = useState(null)
  const [statusNote, setStatusNote] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')

  // Only the very first fetch for this task seeds the notes/qty inputs —
  // a refresh triggered by checking off a checklist item or attaching a
  // photo must never clobber a note the person is still in the middle of
  // typing.
  const load = (seedInputs) => {
    setLoading(true)
    return getTask(taskId).then((d) => {
      setTask(d)
      if (seedInputs) {
        setNotes(d.completion_notes ?? '')
        setQty(d.completed_qty != null ? String(d.completed_qty) : '')
      }
      return d
    }).finally(() => setLoading(false))
  }
  useEffect(() => { load(true) }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => { await load(false); onChanged?.() }

  const isMine = task && (task.assigned_to === null || Number(task.assigned_to) === Number(userId))
  const canAct = task && (isManager || isMine)

  const handleClaim = async () => {
    setSaving(true); setError('')
    try { await claimTask(taskId); await refresh(); toast.success(t('tasks.claimed')) }
    catch (err) { setError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setSaving(false) }
  }

  const handleToggle = async (item) => {
    try { await toggleChecklistItem(taskId, item.id, !item.is_checked); await refresh() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const handleSaveProgress = async () => {
    setSaving(true); setError('')
    try {
      const payload = {}
      if (notes !== (task.completion_notes ?? '')) payload.completion_notes = notes
      if (task.requires_qty && qty !== (task.completed_qty != null ? String(task.completed_qty) : '')) payload.completed_qty = qty
      if (Object.keys(payload).length) await updateTask(taskId, payload)
      await refresh()
      toast.success(t('tasks.progressSaved'))
    } catch (err) { setError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setSaving(false) }
  }

  const handlePickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true); setError('')
    try {
      const compressed = await compressImage(file)
      await uploadTaskPhoto(taskId, compressed)
      await refresh()
    } catch (err) { setError(err?.response?.data?.error ?? t('tasks.couldNotAttachPhoto')) }
    finally { setUploading(false) }
  }
  const handleRemovePhoto = async (attachmentId) => {
    try { await deleteTaskAttachment(attachmentId); await refresh() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const startStatus = (status) => { setPendingStatus(status); setStatusNote(''); setFollowUpAt('') }
  const cancelStatus = () => setPendingStatus(null)
  const confirmPendingStatus = async () => {
    if (!statusNote.trim() || !followUpAt) { setError(t('tasks.explanationAndFollowUpRequired')); return }
    setSaving(true); setError('')
    try {
      await setTaskStatus(taskId, pendingStatus, { status_note: statusNote.trim(), follow_up_at: followUpAt })
      setPendingStatus(null); await refresh()
    } catch (err) { setError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setSaving(false) }
  }

  const handleSimpleStatus = async (status) => {
    setSaving(true); setError('')
    try {
      // Save whatever progress is staged in the notes/qty fields first, so
      // "Mark Complete" doesn't require a separate Save click beforehand.
      const payload = { status }
      if (notes !== (task.completion_notes ?? '')) payload.completion_notes = notes
      if (task.requires_qty && qty !== (task.completed_qty != null ? String(task.completed_qty) : '')) payload.completed_qty = qty
      await updateTask(taskId, payload)
      await refresh()
      toast.success(status === 'completed' ? t('tasks.markedComplete') : t('tasks.updated'))
    } catch (err) { setError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setSaving(false) }
  }

  // Mirrors the server-side check in api/tasks/item.php so the button
  // visibly disables with a reason instead of silently failing.
  const missingForCompletion = (() => {
    if (!task) return []
    const missing = []
    if (task.checklist?.length && task.checklist.some(c => !c.is_checked)) missing.push(t('tasks.missingChecklist'))
    if (task.requires_photo && !(task.attachments?.length)) missing.push(t('tasks.missingPhoto'))
    if (task.requires_note && !notes.trim()) missing.push(t('tasks.missingNote'))
    if (task.requires_qty && qty === '') missing.push(t('tasks.missingQty'))
    return missing
  })()

  return (
    <Modal isOpen onClose={onClose} title={task?.title ?? t('tasks.taskDetail')} size="lg">
      {loading || !task ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_BADGE[task.status]}>{t(`tasks.status.${task.status}`)}</Badge>
            {task.priority === 'high' && <Badge variant="low_stock">{t('tasks.priorityHigh')}</Badge>}
            {task.category && <Tag>{task.category}</Tag>}
            {task.item_sku && <Tag>{task.item_sku} — {task.item_name}</Tag>}
            {task.location_name && <Tag>{task.location_name}</Tag>}
            {task.project_number && <Tag tone="brand">{t('requests.projectLabel', { number: task.project_number, name: task.project_name })}</Tag>}
            {task.order_number && <Tag tone="blue">{task.order_number}</Tag>}
          </div>

          {task.instructions && <TranslatableText text={task.instructions} className="text-sm text-gray-700" />}

          <p className="text-xs text-gray-400">
            {task.assigned_to_name ? t('tasks.assignedTo', { name: task.assigned_to_name }) : t('tasks.unclaimed')}
            {task.due_at && ` · ${t('tasks.due', { date: formatDateTime(task.due_at) })}`}
          </p>

          {['waiting_approval', 'waiting_delivery', 'blocked'].includes(task.status) && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <p className="font-semibold">{t(`tasks.status.${task.status}`)}{task.follow_up_at ? ` — ${t('tasks.followUp', { date: task.follow_up_at })}` : ''}</p>
              {task.status_note && <TranslatableText text={task.status_note} className="mt-1 text-amber-700" />}
            </div>
          )}

          {task.checklist?.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('tasks.checklist')}</label>
              {task.checklist.map((item) => (
                <label key={item.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={!!item.is_checked} disabled={!canAct}
                    onChange={() => handleToggle(item)} className="w-4 h-4 accent-brand-500 shrink-0" />
                  <span className={`text-sm ${item.is_checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.label}</span>
                </label>
              ))}
            </div>
          )}

          {canAct && !['completed', 'canceled'].includes(task.status) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  {t('common.notes')} {!!task.requires_note && <span className="text-red-500">*</span>}
                </label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none" />
              </div>
              {!!task.requires_qty && (
                <Input label={`${t('common.quantity')} *`} type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
              )}
            </>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              {t('tasks.photos')} {!!task.requires_photo && <span className="text-red-500">*</span>}
            </label>
            {task.attachments?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {task.attachments.map((a) => (
                  <div key={a.id} className="relative">
                    <img src={a.url} alt="" className="w-20 h-20 rounded-lg object-cover" />
                    {canAct && (
                      <button type="button" onClick={() => handleRemovePhoto(a.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-5 text-center">✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canAct && !['completed', 'canceled'].includes(task.status) && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePickPhoto} className="hidden" />
                <Button type="button" variant="secondary" size="sm" loading={uploading} onClick={() => fileInputRef.current?.click()} className="w-fit">
                  📷 {t('tasks.addPhoto')}
                </Button>
              </>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {canAct && !['completed', 'canceled'].includes(task.status) && (
            pendingStatus ? (
              <div className="rounded-xl border border-gray-200 p-3 flex flex-col gap-2">
                <p className="text-sm font-semibold text-gray-700">{t(`tasks.status.${pendingStatus}`)}</p>
                <Input label={t('tasks.explanation')} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                <Input label={t('tasks.followUpDate')} type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" loading={saving} onClick={confirmPendingStatus}>{t('common.save')}</Button>
                  <Button size="sm" variant="secondary" onClick={cancelStatus}>{t('common.cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                {task.assigned_to === null && (
                  <Button loading={saving} onClick={handleClaim} fullWidth>{t('tasks.claimTask')}</Button>
                )}
                {task.assigned_to !== null && (
                  <div className="flex flex-wrap gap-2">
                    {task.status === 'to_do' && (
                      <Button size="sm" variant="secondary" loading={saving} onClick={() => handleSimpleStatus('in_progress')}>{t('tasks.startTask')}</Button>
                    )}
                    <Button size="sm" variant="secondary" loading={saving} onClick={handleSaveProgress}>{t('tasks.saveProgress')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => startStatus('blocked')}>{t('tasks.reportProblem')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => startStatus('waiting_delivery')}>{t('tasks.waitingOnDelivery')}</Button>
                    {task.requires_approval ? (
                      <Button size="sm" onClick={() => startStatus('waiting_approval')}>{t('tasks.submitForApproval')}</Button>
                    ) : (
                      <div className="flex flex-col gap-1 w-full sm:w-auto">
                        <Button size="sm" disabled={missingForCompletion.length > 0} loading={saving} onClick={() => handleSimpleStatus('completed')}>
                          {t('tasks.markComplete')}
                        </Button>
                        {missingForCompletion.length > 0 && (
                          <p className="text-xs text-amber-600">{missingForCompletion.join(' · ')}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {isManager && task.status === 'waiting_approval' && (
            <div className="flex flex-col gap-1 pt-2 border-t border-gray-100">
              <div className="flex gap-2">
                <Button size="sm" disabled={missingForCompletion.length > 0} loading={saving} onClick={() => handleSimpleStatus('completed')}>{t('tasks.approve')}</Button>
                <Button size="sm" variant="danger" onClick={() => startStatus('blocked')}>{t('tasks.reject')}</Button>
              </div>
              {missingForCompletion.length > 0 && <p className="text-xs text-amber-600">{missingForCompletion.join(' · ')}</p>}
            </div>
          )}

          {isManager && !['completed', 'canceled'].includes(task.status) && (
            <button type="button" onClick={() => handleSimpleStatus('canceled')} className="text-xs font-semibold text-red-500 hover:underline w-fit">
              {t('tasks.cancelTask')}
            </button>
          )}

          {task.history?.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer font-semibold text-gray-600">{t('tasks.activityHistory')}</summary>
              <div className="flex flex-col gap-1 mt-2">
                {task.history.map((h) => (
                  <p key={h.id}>{formatDateTime(h.created_at)} — {h.actor_name ?? '—'}: {h.action}{h.to_value ? ` → ${h.to_value}` : ''}{h.note ? ` (${h.note})` : ''}</p>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Modal>
  )
}
