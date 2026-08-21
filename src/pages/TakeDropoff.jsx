import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import ScannerLoading from '../components/ui/ScannerLoading'
import SearchSelect from '../components/ui/SearchSelect'
import EstimateNumberField from '../components/ui/EstimateNumberField'
import { listLocations } from '../api/locations'
import { getCurrentStock, checkoutStock, checkinStock } from '../api/stock'
import { lookupItemByBarcode } from '../api/items'
import { useAuthStore } from '../store/authStore'

const EMPTY = { item_id: '', qty: '', project_id: '', taken_by_name: '', notes: '' }
const BarcodeScanner = lazy(() => import('../components/ui/BarcodeScanner'))

// Strip accents so "codo" still finds "Codo 90°" and typing without the
// ° matches fine — a lot of this catalog's names come in with Spanish
// diacritics that a crew member typing from a phone won't bother with.
const normalize = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// One field's match strength, or null if it's not a match at all.
// Ranked so an exact/prefix SKU hit always beats a loose name match:
// exact > starts-with > contains > a whole word starts with it >
// query's letters appear in order somewhere in the text (typo/partial
// tolerant — "shrkbte" still finds "SharkBite").
const fieldScore = (query, text) => {
  if (!text) return null
  const q = normalize(query), t = normalize(text)
  if (!q) return null
  if (t === q) return 100
  if (t.startsWith(q)) return 85
  if (t.includes(q)) return 65
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 55
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  return qi === q.length ? 30 : null
}

// SKU counts for the most (that's what a lead reads off a bin label),
// name next, category/"type" a distant third — a category hit alone
// shouldn't outrank a real name/SKU match.
const itemMatchScore = (item, query) => {
  const sku = fieldScore(query, item.sku)
  const name = fieldScore(query, item.name)
  const category = fieldScore(query, item.category_name)
  const weighted = [
    sku != null ? sku * 1.2 : null,
    name,
    category != null ? category * 0.6 : null,
  ].filter((s) => s != null)
  return weighted.length ? Math.max(...weighted) : null
}

export default function TakeDropoff() {
  const { t } = useTranslation()
  const userName = useAuthStore((s) => s.user?.name)
  const navState = useLocation().state // { tab: 'take' | 'dropoff' } from Dashboard quick actions

  const [tab, setTab]             = useState(navState?.tab === 'dropoff' ? 'dropoff' : 'take')
  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState('')
  const [availability, setAvailability] = useState([])
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [itemSearch, setItemSearch] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)

  useEffect(() => {
    listLocations({ active: 1 }).then((d) => {
      const locs = d.locations ?? []
      setLocations(locs)
      if (locs.length) setLocationId(String(locs[0].id))
    })
  }, [])

  const loadAvailability = (locId) => {
    if (!locId) return
    setLoadingAvail(true)
    getCurrentStock(locId).then((d) => setAvailability(d.items ?? [])).finally(() => setLoadingAvail(false))
  }
  useEffect(() => { loadAvailability(locationId) }, [locationId])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const selectedItem = availability.find(i => String(i.item_id) === form.item_id)

  // Best matches first, capped so the dropdown stays skimmable — see
  // itemMatchScore above for how sku/name/category are weighted.
  const itemMatches = (query) => {
    if (!query.trim()) return []
    return availability
      .map((it) => ({ it, score: itemMatchScore(it, query) }))
      .filter((x) => x.score != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.it)
  }
  const pickItem = (r) => { setForm(f => ({ ...f, item_id: String(r.id) })); setItemSearch('') }

  const switchTab = (t2) => { setTab(t2); setForm(EMPTY); setItemSearch(''); setError(''); setSuccess('') }

  const handleScan = async (barcode) => {
    setScannerOpen(false)
    try {
      const item = await lookupItemByBarcode(barcode)
      setForm(f => ({ ...f, item_id: String(item.id) }))
      setItemSearch('')
    } catch (err) {
      setError(err?.response?.data?.error ?? t('takeDropoff.barcodeNotFound', { barcode }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.item_id || !locationId) { setError(t('takeDropoff.chooseItem')); return }
    if (!form.qty || parseFloat(form.qty) <= 0) { setError(t('takeDropoff.enterQtyPositive')); return }
    setSaving(true); setError(''); setSuccess('')
    const payload = {
      item_id: form.item_id,
      location_id: locationId,
      qty: parseFloat(form.qty),
      project_id: form.project_id || null,
      taken_by_name: form.taken_by_name || null,
      notes: form.notes || null,
    }
    try {
      if (tab === 'take') await checkoutStock(payload)
      else await checkinStock(payload)
      setSuccess(t(tab === 'take' ? 'takeDropoff.tookSuccess' : 'takeDropoff.droppedOffSuccess', {
        qty: form.qty, unit: selectedItem?.unit_of_measure ?? '', name: selectedItem?.name ?? t('takeDropoff.genericItem'),
      }))
      setForm(EMPTY)
      loadAvailability(locationId)
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const currentLocationName = locations.find(l => String(l.id) === locationId)?.name

  // Pale dashboard tones (green/red), matching the Quick Actions on the
  // Dashboard. The whole panel — not just the tab pill — tints to match
  // whichever mode is active, so the tab reads as the actual front flap of
  // a colored folder rather than a control floating on a plain white card.
  const isTake = tab === 'take'
  const panelTone = isTake ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
  const activeTextTone = isTake ? 'text-red-800' : 'text-green-800'

  return (
    <div className="w-full">
      <PageHeader title={t('takeDropoff.title')} subtitle={t('takeDropoff.subtitle')} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,26rem)_1fr] gap-6 items-start">
        {/* Regular shadow utilities only cast downward, so the tab row at
            the very top of the panel looked flat/unelevated — this adds a
            second, upward-cast shadow so the whole card (tabs included)
            reads as raised on every side, not just the bottom. */}
        <div className={`rounded-2xl border p-5 transition-colors shadow-[0_-6px_12px_-4px_rgba(0,0,0,0.08),0_10px_20px_-6px_rgba(0,0,0,0.15)] ${panelTone}`}>
          {/* Back to the original compact pill/segmented-control shape —
              just the small rounded track with a white "selected" chip —
              but still tinted by which mode is active, same as the panel
              behind it. */}
          <div className="flex gap-1 mb-5 bg-black/5 p-1 rounded-xl w-fit mx-auto">
            {[['take', t('takeDropoff.take')], ['dropoff', t('takeDropoff.dropOff')]].map(([key, label]) => (
              <button key={key} type="button" onClick={() => switchTab(key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === key ? `bg-white ${activeTextTone} shadow-sm` : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('common.location')}</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{t('common.item')}</label>
              <div className="flex gap-2 items-start">
                <div className="flex-1 min-w-0">
                  <SearchSelect
                    selected={selectedItem ? {
                      id: selectedItem.item_id, label: selectedItem.name,
                      sublabel: `${selectedItem.sku} — ${t('takeDropoff.availableQty', { qty: selectedItem.qty_on_hand, unit: selectedItem.unit_of_measure })}`,
                    } : null}
                    onClear={() => setForm(f => ({ ...f, item_id: '' }))}
                    search={itemSearch} onSearchChange={setItemSearch}
                    results={itemMatches(itemSearch).map(i => ({
                      id: i.item_id, label: i.name,
                      sublabel: `${i.sku}${i.category_name ? ` · ${i.category_name}` : ''} — ${t('takeDropoff.availableQty', { qty: i.qty_on_hand, unit: i.unit_of_measure })}`,
                    }))}
                    onPick={pickItem}
                    placeholder={t('common.selectItem')}
                  />
                </div>
                {/* Not the shared Button component here — its "secondary"
                    variant forces a solid white bg, which stood out against
                    the select next to it (inputs have no bg override, so
                    they show the panel's pale tint through). This matches
                    the select's own border/transparent styling instead. */}
                <button type="button" onClick={() => setScannerOpen(true)}
                  className="shrink-0 rounded-xl border border-gray-300 px-4 py-3 text-base hover:bg-black/5 transition-colors">
                  📷
                </button>
              </div>
            </div>

            <Input label={`${t('common.quantity')}${selectedItem ? ` (${selectedItem.unit_of_measure})` : ''}`}
              type="number" step="0.01" inputMode="decimal" value={form.qty} onChange={set('qty')} />

            <EstimateNumberField
              key={form.item_id || 'none'}
              label={t('takeDropoff.projectOptional')}
              initialNumber={selectedItem?.default_project_number ?? ''}
              initialName={selectedItem?.default_project_name ?? ''}
              onResolved={(project) => setForm(f => ({ ...f, project_id: project ? String(project.id) : '' }))}
              helperText={t('takeDropoff.estimateHelper')}
            />

            <Input label={t('takeDropoff.takenByOptional')} placeholder={userName ?? t('takeDropoff.yourName')} value={form.taken_by_name} onChange={set('taken_by_name')}
              helperText={t('takeDropoff.takenByHelper')} />

            <Input label={t('common.notes')} value={form.notes} onChange={set('notes')} />

            {error && <p className="text-xs text-red-500">{error}</p>}
            {success && <p className="text-xs text-brand-700 font-medium">{success}</p>}
            <Button type="submit" loading={saving} fullWidth>
              {tab === 'take' ? t('takeDropoff.logTake') : t('takeDropoff.logDropOff')}
            </Button>
          </form>
        </div>

        <Card title={currentLocationName ? t('takeDropoff.availabilityAt', { location: currentLocationName }) : t('takeDropoff.availability')}>
          {loadingAvail ? (
            <p className="text-sm text-gray-400 py-10 text-center">{t('common.loading')}</p>
          ) : availability.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">{t('takeDropoff.nothingTracked')}</p>
          ) : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['', t('common.sku'), t('common.name'), t('takeDropoff.available')].map((h, idx) => (
                      <th key={`${h}-${idx}`} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {availability.map((i) => (
                    <tr key={i.item_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {i.image_url ? (
                          <img src={i.image_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-sm">📦</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{i.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{i.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={i.qty_on_hand <= 0 ? 'out_of_stock' : i.reorder_point && i.qty_on_hand < i.reorder_point ? 'low_stock' : 'in_stock'}>
                          {i.qty_on_hand} {i.unit_of_measure}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {scannerOpen && (
        <Suspense fallback={<ScannerLoading />}>
          <BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={handleScan} />
        </Suspense>
      )}
    </div>
  )
}
