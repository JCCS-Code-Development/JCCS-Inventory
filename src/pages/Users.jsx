import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { listUsers, createUser, updateUser, deactivateUser } from '../api/users'
import { listEmployees } from '../api/fieldclockAuth'
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

  // "Search FieldClock by name/email" instead of typing a raw ID — only
  // for creating a new user; editing an existing one never needs it. Loaded
  // once when the modal opens, not kept fresh in the background.
  const [employees, setEmployees]           = useState(null) // null = not loaded yet, [] = loaded but empty
  const [employeesError, setEmployeesError] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [pickedEmployee, setPickedEmployee] = useState(null) // {id, name, email} once chosen
  const [manualEntry, setManualEntry]       = useState(false) // fallback: type the ID directly

  const load = () => {
    setLoading(true)
    listUsers().then(d => setUsers(d.users ?? [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => {
    setForm(EMPTY); setError(''); setModal('create')
    setEmployeeSearch(''); setPickedEmployee(null); setManualEntry(false)
    setEmployees(null); setEmployeesError(false)
    listEmployees()
      .then(d => setEmployees(d.employees ?? []))
      .catch(() => { setEmployeesError(true); setManualEntry(true) }) // not a FieldClock admin, or FieldClock unreachable — just fall back
  }
  const openEdit = (u) => { setForm({ fieldclock_user_id: String(u.fieldclock_user_id), name: u.name, role: u.role }); setError(''); setModal(u) }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const provisionedIds = new Set(users.map(u => String(u.fieldclock_user_id)))
  const employeeMatches = !employeeSearch.trim() ? [] : (employees ?? []).filter((emp) => {
    if (provisionedIds.has(String(emp.id))) return false // already has Inventory access — nothing to pick
    const q = employeeSearch.trim().toLowerCase()
    return emp.name.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q)
  })

  const pickEmployee = (emp) => {
    setPickedEmployee(emp)
    setForm(f => ({ ...f, fieldclock_user_id: String(emp.id), name: emp.name }))
    setEmployeeSearch('')
  }
  const clearPickedEmployee = () => {
    setPickedEmployee(null)
    setForm(f => ({ ...f, fieldclock_user_id: '', name: '' }))
  }

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
            manualEntry ? (
              <div className="flex flex-col gap-1">
                <Input label={t('users.fieldclockUserId')} type="number" value={form.fieldclock_user_id} onChange={set('fieldclock_user_id')}
                  helperText={t('users.fieldclockIdHelper')} />
                {!employeesError && (
                  <button type="button" onClick={() => setManualEntry(false)} className="text-xs font-semibold text-brand-500 hover:underline w-fit">
                    {t('users.searchInstead')}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t('users.findPerson')}</label>
                {pickedEmployee ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-300 bg-brand-50/50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{pickedEmployee.name}</p>
                      <p className="text-xs text-gray-500 truncate">{pickedEmployee.email}</p>
                    </div>
                    <button type="button" onClick={clearPickedEmployee} className="text-xs font-semibold text-gray-400 hover:text-gray-600 shrink-0">
                      {t('common.change')}
                    </button>
                  </div>
                ) : (
                  <>
                    <input type="text" placeholder={t('users.searchPlaceholder')} value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)} disabled={employees === null}
                      className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400" />
                    {employees === null ? (
                      <p className="text-xs text-gray-400">{t('users.loadingDirectory')}</p>
                    ) : employeeSearch.trim() && (
                      employeeMatches.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">{t('users.noMatches')}</p>
                      ) : (
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-xl border border-gray-100 p-1.5">
                          {employeeMatches.map((emp) => (
                            <button key={emp.id} type="button" onClick={() => pickEmployee(emp)}
                              className="text-left rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                              <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                              <p className="text-xs text-gray-400">{emp.email}</p>
                            </button>
                          ))}
                        </div>
                      )
                    )}
                    <button type="button" onClick={() => setManualEntry(true)} className="text-xs font-semibold text-gray-400 hover:text-gray-600 w-fit">
                      {t('users.enterIdManually')}
                    </button>
                  </>
                )}
              </div>
            )
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
