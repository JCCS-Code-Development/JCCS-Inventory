import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { listTools, checkoutTool, checkinTool } from '../api/tools'
import { listUsers } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { formatDate, formatDateTime } from '../utils/format'
import { useToast } from '../components/ToastProvider'

// Tools/equipment flagged items.is_trackable_asset (set from the Items
// page's "more details" section) — this page is just their checkout/return
// lifecycle. A basic user sees only their own current checkout + whatever's
// still unassigned (enforced server-side in api/tools/index.php); a Lead/
// admin sees and can act on the whole roster.
export default function Tools() {
  const { t } = useTranslation()
  const toast = useToast()
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'admin' || role === 'specialist'

  const [tools, setTools] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const [checkingOutId, setCheckingOutId] = useState(null)
  const [checkoutAssignee, setCheckoutAssignee] = useState('')
  const [checkoutDueBack, setCheckoutDueBack] = useState('')
  const [returningId, setReturningId] = useState(null)
  const [returnNotes, setReturnNotes] = useState('')
  const [actingId, setActingId] = useState(null)

  const load = () => {
    setLoading(true)
    listTools().then(d => setTools(d.tools ?? [])).finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    if (canManage) listUsers().then(d => setUsers(d.users ?? [])).catch(() => setUsers([]))
  }, [canManage])

  const startCheckout = (itemId) => { setCheckingOutId(itemId); setCheckoutAssignee(''); setCheckoutDueBack('') }
  const cancelCheckout = () => setCheckingOutId(null)
  const confirmCheckout = async (itemId) => {
    if (!checkoutAssignee) return
    setActingId(itemId)
    try {
      await checkoutTool({ item_id: itemId, assigned_to: checkoutAssignee, due_back_at: checkoutDueBack || null })
      toast.success(t('tools.checkedOut'))
      setCheckingOutId(null); load()
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  const startReturn = (checkoutId) => { setReturningId(checkoutId); setReturnNotes('') }
  const cancelReturn = () => setReturningId(null)
  const confirmReturn = async (checkoutId) => {
    setActingId(checkoutId)
    try {
      await checkinTool({ checkout_id: checkoutId, condition_notes: returnNotes.trim() || null })
      toast.success(t('tools.returned'))
      setReturningId(null); load()
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
    finally { setActingId(null) }
  }

  return (
    <div className="w-full">
      <PageHeader title={t('tools.title')} subtitle={t('tools.subtitle')} />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : tools.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <p className="text-center text-gray-400 py-16 text-sm">
            {canManage ? t('tools.noneRegistered') : t('tools.noneAssigned')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tools.map((tool) => (
            <div key={tool.item_id} className={`rounded-2xl border bg-white p-4 flex flex-col gap-2.5 ${
              tool.is_overdue ? 'border-red-200' : 'border-gray-100'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-center gap-3">
                  {tool.image_url && <img src={tool.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{tool.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{tool.sku}</p>
                  </div>
                </div>
                {tool.checkout_id ? (
                  <Badge variant={tool.is_overdue ? 'low_stock' : 'checkout'}>
                    {tool.is_overdue ? t('tools.overdue') : t('tools.checkedOutBadge')}
                  </Badge>
                ) : (
                  <Badge variant="in_stock">{t('tools.available')}</Badge>
                )}
              </div>

              {tool.checkout_id ? (
                <div className="text-xs text-gray-500 flex flex-col gap-0.5">
                  <p>{t('tools.assignedTo', { name: tool.assigned_to_name ?? '—' })}</p>
                  <p>
                    {t('tools.checkedOutOn', { date: formatDateTime(tool.checked_out_at) })}
                    {tool.due_back_at && ` · ${t('tools.dueBack', { date: formatDate(tool.due_back_at) })}`}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">{t('tools.notCheckedOut')}</p>
              )}

              {tool.checkout_id ? (
                returningId === tool.checkout_id ? (
                  <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 mt-1">
                    <Input placeholder={t('tools.conditionNotesPlaceholder')} value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" loading={actingId === tool.checkout_id} onClick={() => confirmReturn(tool.checkout_id)}>{t('tools.confirmReturn')}</Button>
                      <Button size="sm" variant="secondary" onClick={cancelReturn}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" className="w-fit" onClick={() => startReturn(tool.checkout_id)}>{t('tools.returnTool')}</Button>
                )
              ) : canManage ? (
                checkingOutId === tool.item_id ? (
                  <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 mt-1">
                    <select value={checkoutAssignee} onChange={(e) => setCheckoutAssignee(e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                      <option value="">{t('tools.selectEmployee')}</option>
                      {users.filter(u => u.is_active).map(u => <option key={u.fieldclock_user_id} value={u.fieldclock_user_id}>{u.name}</option>)}
                    </select>
                    <Input type="date" label={t('tools.dueBackOptional')} value={checkoutDueBack} onChange={(e) => setCheckoutDueBack(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!checkoutAssignee} loading={actingId === tool.item_id} onClick={() => confirmCheckout(tool.item_id)}>{t('tools.confirmCheckout')}</Button>
                      <Button size="sm" variant="secondary" onClick={cancelCheckout}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" className="w-fit" onClick={() => startCheckout(tool.item_id)}>{t('tools.checkOut')}</Button>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
