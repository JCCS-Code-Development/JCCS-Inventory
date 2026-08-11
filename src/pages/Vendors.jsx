import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { listVendors, createVendor, updateVendor, deactivateVendor } from '../api/vendors'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY = { name: '', contact_name: '', email: '', phone: '', address: '', notes: '' }

export default function Vendors() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const load = () => {
    setLoading(true)
    listVendors().then(d => setVendors(d.vendors ?? [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create') }
  const openEdit = (v) => {
    setForm({ name: v.name, contact_name: v.contact_name ?? '', email: v.email ?? '', phone: v.phone ?? '', address: v.address ?? '', notes: v.notes ?? '' })
    setError(''); setModal(v)
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('vendors.nameRequired')); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, name: form.name.trim() }
      if (modal === 'create') await createVendor(payload)
      else await updateVendor(modal.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (v) => {
    if (!await confirmDialog(t('vendors.deactivateConfirm', { name: v.name }), { danger: true, confirmLabel: t('common.deactivate') })) return
    try { await deactivateVendor(v.id); load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('vendors.couldNotDeactivate')) }
  }

  return (
    <div className="w-full">
      <PageHeader title={t('vendors.title')} subtitle={t('vendors.subtitle')} actions={<Button onClick={openCreate}>{t('vendors.addVendor')}</Button>} />

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {vendors.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">{t('vendors.noVendorsYet')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('common.name'), t('vendors.contact'), t('vendors.phone'), t('vendors.email'), ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vendors.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                      <td className="px-4 py-3 text-gray-600">{v.contact_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.email ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(v)} className="text-xs font-semibold text-brand-500 hover:underline">{t('common.edit')}</button>
                          <button onClick={() => handleDeactivate(v)} className="text-xs font-semibold text-red-500 hover:underline">{t('common.deactivate')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('vendors.addVendor') : t('vendors.editVendor')}>
        <div className="flex flex-col gap-4">
          <Input label={t('common.name')} value={form.name} onChange={set('name')} />
          <Input label={t('vendors.contactName')} value={form.contact_name} onChange={set('contact_name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('vendors.phone')} value={form.phone} onChange={set('phone')} />
            <Input label={t('vendors.email')} value={form.email} onChange={set('email')} />
          </div>
          <Input label={t('vendors.address')} value={form.address} onChange={set('address')} />
          <Input label={t('common.notes')} value={form.notes} onChange={set('notes')} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={handleSave} loading={saving} fullWidth>{t('vendors.saveVendor')}</Button>
        </div>
      </Modal>
    </div>
  )
}
