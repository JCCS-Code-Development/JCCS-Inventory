import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { listUsers, createUser, updateUser, deactivateUser } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'

const EMPTY = { fieldclock_user_id: '', name: '', role: 'user' }
const ROLE_BADGE  = { admin: 'receive', specialist: 'count_adjustment', user: 'inactive' }

export default function Users() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const myId = useAuthStore((s) => s.user?.id)
  const ROLE_LABELS = { admin: t('role.admin'), specialist: t('role.specialist'), user: t('role.user') }

  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const load = () => {
    setLoading(true)
    listUsers().then(d => setUsers(d.users ?? [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create') }
  const openEdit = (u) => { setForm({ fieldclock_user_id: String(u.fieldclock_user_id), name: u.name, role: u.role }); setError(''); setModal(u) }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (modal === 'create' && !form.fieldclock_user_id) { setError(t('users.fieldclockIdRequired')); return }
    if (!form.name.trim()) { setError(t('users.nameRequired')); return }
    setSaving(true); setError('')
    try {
      if (modal === 'create') {
        await createUser({ fieldclock_user_id: form.fieldclock_user_id, name: form.name.trim(), role: form.role })
      } else {
        await updateUser(modal.fieldclock_user_id, { name: form.name.trim(), role: form.role })
      }
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (u) => {
    if (!await confirmDialog(t('users.removeAccessConfirm', { name: u.name }), { danger: true, confirmLabel: t('users.removeAccess') })) return
    try { await deactivateUser(u.fieldclock_user_id); load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('users.couldNotDeactivate')) }
  }

  return (
    <div className="w-full">
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={<Button onClick={openCreate}>{t('users.addUser')}</Button>}
      />

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {users.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">{t('users.noUsersYet')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('common.name'), t('users.fieldclockId'), t('users.role'), t('users.status'), ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.fieldclock_user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {u.name}{u.fieldclock_user_id === myId && <span className="text-xs text-gray-400 ml-1.5">{t('users.you')}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.fieldclock_user_id}</td>
                      <td className="px-4 py-3"><Badge variant={ROLE_BADGE[u.role]}>{ROLE_LABELS[u.role]}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={u.is_active ? 'active' : 'inactive'}>{u.is_active ? t('users.active') : t('users.inactive')}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(u)} className="text-xs font-semibold text-brand-500 hover:underline">{t('common.edit')}</button>
                          {u.fieldclock_user_id !== myId && u.is_active === 1 && (
                            <button onClick={() => handleDeactivate(u)} className="text-xs font-semibold text-red-500 hover:underline">{t('users.removeAccess')}</button>
                          )}
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

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('users.addUser') : t('users.editUser')}>
        <div className="flex flex-col gap-4">
          {modal === 'create' && (
            <Input label={t('users.fieldclockUserId')} type="number" value={form.fieldclock_user_id} onChange={set('fieldclock_user_id')}
              helperText={t('users.fieldclockIdHelper')} />
          )}
          <Input label={t('common.name')} value={form.name} onChange={set('name')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('users.role')}</label>
            <select value={form.role} onChange={set('role')} disabled={modal !== 'create' && modal?.fieldclock_user_id === myId}
              className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="user">{t('users.roleUserOption')}</option>
              <option value="specialist">{t('users.roleSpecialistOption')}</option>
              <option value="admin">{t('users.roleAdminOption')}</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={handleSave} loading={saving} fullWidth>{t('users.saveUser')}</Button>
        </div>
      </Modal>
    </div>
  )
}
