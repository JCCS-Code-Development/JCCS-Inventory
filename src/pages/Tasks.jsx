import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Tag from '../components/ui/Tag'
import TaskDetailModal from '../components/tasks/TaskDetailModal'
import { listTasks, createTask, updateTask } from '../api/tasks'
import { listTaskTemplates, createTaskTemplate, updateTaskTemplate, deactivateTaskTemplate } from '../api/taskTemplates'
import { listUsers } from '../api/users'
import { listLocations } from '../api/locations'
import { formatDate } from '../utils/format'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const STATUS_BADGE = {
  to_do: 'active', in_progress: 'checkout', waiting_approval: 'partially_received',
  waiting_delivery: 'partially_received', blocked: 'low_stock', completed: 'in_stock', canceled: 'cancelled',
}
const EMPTY_TASK = { title: '', instructions: '', category: '', priority: 'normal', assigned_to: '', location_id: '', due_at: '', checklist: [''] }
const EMPTY_TEMPLATE = {
  title: '', instructions: '', category: 'recurring', frequency: 'daily', default_priority: 'normal',
  default_assignee: '', default_location_id: '', requires_approval: false, requires_photo: false,
  requires_note: false, requires_qty: false, is_active: true, checklist: [''],
}

// The manager's side of the task system: a filterable board of every task
// (assign/reassign/cancel), and the recurring/improvement templates that
// api/cron/generate-tasks.php turns into real tasks on schedule.
export default function Tasks() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()

  const [tab, setTab] = useState('board') // 'board' | 'templates'
  const [tasks, setTasks] = useState([])
  const [templates, setTemplates] = useState([])
  const [users, setUsers] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [openTaskId, setOpenTaskId] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_TASK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [templateModal, setTemplateModal] = useState(null) // 'create' | template row | null
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState('')

  const loadTasks = () => {
    setLoading(true)
    listTasks(statusFilter ? { status: statusFilter } : {}).then(d => setTasks(d.tasks ?? [])).finally(() => setLoading(false))
  }
  const loadTemplates = () => listTaskTemplates().then(d => setTemplates(d.templates ?? []))

  useEffect(() => { loadTasks() }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadTemplates()
    listUsers().then(d => setUsers(d.users ?? [])).catch(() => setUsers([]))
    listLocations({ active: 1 }).then(d => setLocations(d.locations ?? []))
  }, [])

  // ── Manual task creation ────────────────────────────────────────────
  const openCreate = () => { setForm(EMPTY_TASK); setError(''); setCreateOpen(true) }
  const setField = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setChecklistLine = (i, v) => setForm(f => ({ ...f, checklist: f.checklist.map((l, idx) => idx === i ? v : l) }))
  const addChecklistLine = () => setForm(f => ({ ...f, checklist: [...f.checklist, ''] }))
  const handleCreate = async () => {
    if (!form.title.trim()) { setError(t('tasks.titleRequired')); return }
    setSaving(true); setError('')
    try {
      await createTask({
        ...form,
        assigned_to: form.assigned_to || null,
        location_id: form.location_id || null,
        due_at: form.due_at || null,
        checklist: form.checklist.filter(l => l.trim()),
      })
      toast.success(t('tasks.taskCreated'))
      setCreateOpen(false); loadTasks()
    } catch (err) { setError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setSaving(false) }
  }

  const handleReassign = async (taskId, userId) => {
    try { await updateTask(taskId, { assigned_to: userId || null }); loadTasks() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }
  const handleCancel = async (task) => {
    if (!await confirmDialog(t('tasks.cancelConfirm', { title: task.title }), { danger: true, confirmLabel: t('common.delete') })) return
    try { await updateTask(task.id, { status: 'canceled' }); loadTasks() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  // ── Templates ────────────────────────────────────────────────────────
  const openTemplateCreate = () => { setTemplateForm(EMPTY_TEMPLATE); setTemplateError(''); setTemplateModal('create') }
  const openTemplateEdit = (tpl) => {
    setTemplateForm({
      title: tpl.title, instructions: tpl.instructions ?? '', category: tpl.category,
      frequency: tpl.frequency ?? 'daily', default_priority: tpl.default_priority,
      default_assignee: tpl.default_assignee ? String(tpl.default_assignee) : '',
      default_location_id: tpl.default_location_id ? String(tpl.default_location_id) : '',
      requires_approval: !!tpl.requires_approval, requires_photo: !!tpl.requires_photo,
      requires_note: !!tpl.requires_note, requires_qty: !!tpl.requires_qty, is_active: !!tpl.is_active,
      checklist: tpl.checklist?.length ? tpl.checklist.map(c => c.label) : [''],
    })
    setTemplateError(''); setTemplateModal(tpl)
  }
  const setTemplateField = (k) => (e) => setTemplateForm(f => ({ ...f, [k]: e.target.value }))
  const setTemplateChecklistLine = (i, v) => setTemplateForm(f => ({ ...f, checklist: f.checklist.map((l, idx) => idx === i ? v : l) }))
  const addTemplateChecklistLine = () => setTemplateForm(f => ({ ...f, checklist: [...f.checklist, ''] }))
  const handleSaveTemplate = async () => {
    if (!templateForm.title.trim()) { setTemplateError(t('tasks.titleRequired')); return }
    setTemplateSaving(true); setTemplateError('')
    try {
      const payload = {
        ...templateForm,
        default_assignee: templateForm.default_assignee || null,
        default_location_id: templateForm.default_location_id || null,
        checklist: templateForm.checklist.filter(l => l.trim()),
      }
      if (templateModal === 'create') await createTaskTemplate(payload)
      else await updateTaskTemplate(templateModal.id, payload)
      toast.success(t('tasks.templateSaved'))
      setTemplateModal(null); loadTemplates()
    } catch (err) { setTemplateError(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setTemplateSaving(false) }
  }
  const handleDeactivateTemplate = async (tpl) => {
    if (!await confirmDialog(t('tasks.deactivateTemplateConfirm', { title: tpl.title }), { danger: true, confirmLabel: t('common.deactivate') })) return
    try { await deactivateTaskTemplate(tpl.id); loadTemplates() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  return (
    <div className="w-full">
      <PageHeader title={t('tasks.pageTitle')} subtitle={t('tasks.pageSubtitle')}
        actions={tab === 'board'
          ? <Button onClick={openCreate}>{t('tasks.newTask')}</Button>
          : <Button onClick={openTemplateCreate}>{t('tasks.newTemplate')}</Button>} />

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['board', t('tasks.tabBoard')], ['templates', t('tasks.tabTemplates')]].map(([val, label]) => (
          <button key={val} type="button" onClick={() => setTab(val)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === val ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {[['', t('orders.tabAll')], ['to_do,in_progress', t('tasks.filterOpen')], ['waiting_approval', t('tasks.status.waiting_approval')],
              ['waiting_delivery', t('tasks.status.waiting_delivery')], ['blocked', t('tasks.status.blocked')], ['completed', t('tasks.status.completed')]].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setStatusFilter(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === val ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : tasks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <p className="text-center text-gray-400 py-16 text-sm">{t('tasks.noneHere')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-gray-100 bg-white p-3.5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setOpenTaskId(task.id)} className="text-left min-w-0">
                      <p className="text-sm font-semibold text-gray-900 hover:underline truncate">{task.title}</p>
                      <p className="text-xs text-gray-400">{task.category || t(`tasks.source.${task.source}`)}{task.due_at ? ` · ${formatDate(task.due_at)}` : ''}</p>
                    </button>
                    <Badge variant={STATUS_BADGE[task.status]}>{t(`tasks.status.${task.status}`)}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {task.location_name && <Tag>{task.location_name}</Tag>}
                    {task.item_sku && <Tag>{task.item_sku} — {task.item_name}</Tag>}
                    {task.checklist_total > 0 && <Tag>{task.checklist_done}/{task.checklist_total}</Tag>}
                  </div>
                  {!['completed', 'canceled'].includes(task.status) && (
                    <div className="flex items-center gap-2 pt-1">
                      <select value={task.assigned_to ?? ''} onChange={(e) => handleReassign(task.id, e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-brand-500">
                        <option value="">{t('tasks.unclaimed')}</option>
                        {users.filter(u => u.is_active).map(u => <option key={u.fieldclock_user_id} value={u.fieldclock_user_id}>{u.name}</option>)}
                      </select>
                      <button type="button" onClick={() => handleCancel(task)} className="text-xs font-semibold text-red-500 hover:underline">
                        {t('tasks.cancelTask')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2.5">
          {templates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <p className="text-center text-gray-400 py-16 text-sm">{t('tasks.noTemplates')}</p>
            </div>
          ) : templates.map((tpl) => (
            <div key={tpl.id} className={`rounded-xl border bg-white p-3.5 flex items-center justify-between gap-3 ${tpl.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{tpl.title}</p>
                <p className="text-xs text-gray-400">
                  {tpl.category === 'recurring' ? t(`tasks.frequency.${tpl.frequency}`) : t('tasks.improvementBacklog')}
                  {tpl.default_assignee_name ? ` · ${tpl.default_assignee_name}` : ` · ${t('tasks.unclaimed')}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => openTemplateEdit(tpl)}>{t('common.edit')}</Button>
                {!!tpl.is_active && <Button size="sm" variant="danger" onClick={() => handleDeactivateTemplate(tpl)}>{t('common.deactivate')}</Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── New manual task ─────────────────────────────────────────── */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('tasks.newTask')}>
        <div className="flex flex-col gap-4">
          <Input label={t('common.name')} value={form.title} onChange={setField('title')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('tasks.instructions')}</label>
            <textarea value={form.instructions} onChange={setField('instructions')} rows={3}
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('tasks.assignTo')}</label>
              <select value={form.assigned_to} onChange={setField('assigned_to')}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500">
                <option value="">{t('tasks.unclaimed')}</option>
                {users.filter(u => u.is_active).map(u => <option key={u.fieldclock_user_id} value={u.fieldclock_user_id}>{u.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('common.location')}</label>
              <select value={form.location_id} onChange={setField('location_id')}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500">
                <option value="">{t('common.none')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('tasks.priorityLabel')}</label>
              <select value={form.priority} onChange={setField('priority')}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500">
                <option value="low">{t('tasks.priorityLow')}</option>
                <option value="normal">{t('tasks.priorityNormal')}</option>
                <option value="high">{t('tasks.priorityHigh')}</option>
              </select>
            </div>
            <Input label={t('tasks.dueDate')} type="datetime-local" value={form.due_at} onChange={setField('due_at')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t('tasks.checklist')}</label>
            {form.checklist.map((line, i) => (
              <input key={i} type="text" value={line} onChange={(e) => setChecklistLine(i, e.target.value)}
                placeholder={t('tasks.checklistItemPlaceholder')}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addChecklistLine} className="w-fit">{t('tasks.addChecklistItem')}</Button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={handleCreate} loading={saving} fullWidth>{t('tasks.createTask')}</Button>
        </div>
      </Modal>

      {/* ── Template create/edit ───────────────────────────────────────── */}
      <Modal isOpen={!!templateModal} onClose={() => setTemplateModal(null)} title={templateModal === 'create' ? t('tasks.newTemplate') : t('tasks.editTemplate')}>
        <div className="flex flex-col gap-4">
          <Input label={t('common.name')} value={templateForm.title} onChange={setTemplateField('title')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('tasks.instructions')}</label>
            <textarea value={templateForm.instructions} onChange={setTemplateField('instructions')} rows={3}
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['recurring', 'improvement'].map((cat) => (
              <button key={cat} type="button" onClick={() => setTemplateForm(f => ({ ...f, category: cat }))}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold text-left transition-colors ${
                  templateForm.category === cat ? 'border-brand-500 bg-brand-100 text-brand-800' : 'border-gray-300 text-gray-600'
                }`}>
                {cat === 'recurring' ? t('tasks.categoryRecurring') : t('tasks.categoryImprovement')}
              </button>
            ))}
          </div>
          {templateForm.category === 'recurring' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('tasks.frequencyLabel')}</label>
              <select value={templateForm.frequency} onChange={setTemplateField('frequency')}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500">
                {['daily', 'weekly', 'monthly', 'quarterly'].map(f => <option key={f} value={f}>{t(`tasks.frequency.${f}`)}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('tasks.defaultAssignee')}</label>
              <select value={templateForm.default_assignee} onChange={setTemplateField('default_assignee')}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500">
                <option value="">{t('tasks.unclaimedPool')}</option>
                {users.filter(u => u.is_active).map(u => <option key={u.fieldclock_user_id} value={u.fieldclock_user_id}>{u.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('common.location')}</label>
              <select value={templateForm.default_location_id} onChange={setTemplateField('default_location_id')}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500">
                <option value="">{t('common.none')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t('tasks.checklist')}</label>
            {templateForm.checklist.map((line, i) => (
              <input key={i} type="text" value={line} onChange={(e) => setTemplateChecklistLine(i, e.target.value)}
                placeholder={t('tasks.checklistItemPlaceholder')}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addTemplateChecklistLine} className="w-fit">{t('tasks.addChecklistItem')}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[['requires_approval', t('tasks.requiresApproval')], ['requires_photo', t('tasks.requiresPhoto')],
              ['requires_note', t('tasks.requiresNote')], ['requires_qty', t('tasks.requiresQty')]].map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={templateForm[field]}
                  onChange={(e) => setTemplateForm(f => ({ ...f, [field]: e.target.checked }))}
                  className="w-4 h-4 accent-brand-500" />
                {label}
              </label>
            ))}
          </div>
          {templateModal !== 'create' && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={templateForm.is_active}
                onChange={(e) => setTemplateForm(f => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4 accent-brand-500" />
              {t('tasks.templateActive')}
            </label>
          )}
          {templateError && <p className="text-xs text-red-500">{templateError}</p>}
          <Button onClick={handleSaveTemplate} loading={templateSaving} fullWidth>{t('common.save')}</Button>
        </div>
      </Modal>

      {openTaskId && (
        <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={loadTasks} />
      )}
    </div>
  )
}
