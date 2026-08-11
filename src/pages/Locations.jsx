import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { listLocations, createLocation, updateLocation, deactivateLocation } from '../api/locations'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY = { name: '', address: '' }

export default function Locations() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const [locations, setLocations] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = () => {
    setLoading(true)
    listLocations().then(d => setLocations(d.locations ?? [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create') }
  const openEdit = (l) => { setForm({ name: l.name, address: l.address ?? '' }); setError(''); setModal(l) }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('locations.nameRequired')); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, name: form.name.trim() }
      if (modal === 'create') await createLocation(payload)
      else await updateLocation(modal.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (l) => {
    if (!await confirmDialog(t('locations.deactivateConfirm', { name: l.name }), { danger: true, confirmLabel: t('common.deactivate') })) return
    try { await deactivateLocation(l.id); load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('locations.couldNotDeactivate')) }
  }

  return (
    <div className="w-full">
      <PageHeader title={t('locations.title')} subtitle={t('locations.subtitle')} actions={<Button onClick={openCreate}>{t('locations.addLocation')}</Button>} />

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {locations.map(l => (
            <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{l.name}</p>
                  {l.address && <p className="text-sm text-gray-500 truncate">{l.address}</p>}
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button onClick={() => openEdit(l)} className="flex-1 text-xs font-semibold text-brand-500 hover:bg-brand-100 rounded-lg py-1.5 transition-colors">{t('common.edit')}</button>
                <button onClick={() => handleDeactivate(l)} className="flex-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg py-1.5 transition-colors">{t('common.deactivate')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('locations.addLocation') : t('locations.editLocation')}>
        <div className="flex flex-col gap-4">
          <Input label={t('common.name')} value={form.name} onChange={set('name')} />
          <Input label={t('vendors.address')} value={form.address} onChange={set('address')} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={handleSave} loading={saving} fullWidth>{t('locations.saveLocation')}</Button>
        </div>
      </Modal>
    </div>
  )
}
