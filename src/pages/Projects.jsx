import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { listProjects, createProject, updateProject, deactivateProject } from '../api/projects'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY = { name: '', project_number: '', client_name: '', client_address: '' }

export default function Projects() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const load = () => {
    setLoading(true)
    listProjects().then(d => setProjects(d.projects ?? [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create') }
  const openEdit = (p) => {
    setForm({
      name: p.name, project_number: p.project_number ?? '',
      client_name: p.client_name ?? '', client_address: p.client_address ?? '',
    })
    setError(''); setModal(p)
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('projects.nameRequired')); return }
    if (!/^\d{4}$/.test(form.project_number.trim())) { setError(t('projects.estimateMustBe4Digits')); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, name: form.name.trim() }
      if (modal === 'create') await createProject(payload)
      else await updateProject(modal.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleMarkCompleted = async (p) => {
    if (!await confirmDialog(t('projects.markCompletedConfirm', { name: p.name }), { confirmLabel: t('projects.markCompleted') })) return
    try { await deactivateProject(p.id); load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('projects.couldNotUpdate')) }
  }

  return (
    <div className="w-full">
      <PageHeader title={t('projects.title')} subtitle={t('projects.subtitle')} actions={<Button onClick={openCreate}>{t('projects.addProject')}</Button>} />

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h4l2 2h7A2.5 2.5 0 0121 9.5v7A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                    <Badge variant={p.status === 'completed' ? 'inactive' : 'active'}>{p.status === 'completed' ? t('projects.completed') : t('projects.active')}</Badge>
                  </div>
                  {p.project_number && <p className="text-xs text-gray-400 font-mono mt-0.5">{p.project_number}</p>}
                  {p.client_name && <p className="text-sm text-gray-500 mt-0.5 truncate">{p.client_name}</p>}
                  {p.client_address && <p className="text-xs text-gray-400 truncate">{p.client_address}</p>}
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button onClick={() => openEdit(p)} className="flex-1 text-xs font-semibold text-brand-500 hover:bg-brand-100 rounded-lg py-1.5 transition-colors">{t('common.edit')}</button>
                {p.status !== 'completed' && (
                  <button onClick={() => handleMarkCompleted(p)} className="flex-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg py-1.5 transition-colors">{t('projects.markCompleted')}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('projects.addProject') : t('projects.editProject')}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('common.name')} value={form.name} onChange={set('name')} />
            <Input label={t('projects.estimateNumberDigits')} value={form.project_number}
              onChange={(e) => setForm(f => ({ ...f, project_number: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              inputMode="numeric" maxLength={4} placeholder="4521" />
          </div>
          <Input label={t('projects.clientNameOptional')} value={form.client_name} onChange={set('client_name')} />
          <Input label={t('projects.clientAddressOptional')} value={form.client_address} onChange={set('client_address')} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={handleSave} loading={saving} fullWidth>{t('projects.saveProject')}</Button>
        </div>
      </Modal>
    </div>
  )
}
