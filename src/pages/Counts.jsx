import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/admin/PageHeader'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { listLocations } from '../api/locations'
import { getCurrentStock, submitCount } from '../api/stock'
import { useConfirm } from '../components/ConfirmProvider'
import { useToast } from '../components/ToastProvider'
import { useBadgeStore, COUNTS_DRAFT_STORAGE_KEY } from '../store/badgeStore'
import { translateCategoryName } from '../utils/catalogNames'

// A count "in progress" (checked off but not yet saved) is only ever
// ephemeral component state — it doesn't exist anywhere on the server. To
// give it a nav bubble (and to not silently lose someone's half-finished
// count if they navigate away), it's mirrored into localStorage instead.
const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(COUNTS_DRAFT_STORAGE_KEY) || 'null') } catch { return null }
}
const saveDraft = (data) => {
  try { localStorage.setItem(COUNTS_DRAFT_STORAGE_KEY, JSON.stringify(data)) } catch { /* draft just won't survive a reload */ }
}
const clearDraft = () => {
  try { localStorage.removeItem(COUNTS_DRAFT_STORAGE_KEY) } catch { /* see above */ }
}

// Same collapsible-group pattern as Items/Orders — a category at a time is
// a much easier way to work a shelf than one long undivided list, and
// collapsing a section you've already finished keeps the rest in view.
function CategorySection({ title, count, children }) {
  return (
    <details open className="group bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-3 bg-gray-50 flex items-center justify-between text-sm font-semibold text-gray-700">
        <span className="flex items-center gap-2">
          <span className="text-gray-400 inline-block transition-transform group-open:rotate-90">▸</span>
          {title}
        </span>
        <span className="text-xs font-normal text-gray-400">{count}</span>
      </summary>
      <div className="border-t border-gray-100 p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">{children}</div>
      </div>
    </details>
  )
}

// A physical count, made as easy as possible for someone who's never done
// inventory before: walk the shelf, check off what you see, only type a
// number when it's actually different from what the system expected.
// Everything else — the math, the fix, the record of what changed — the
// app takes care of on its own.
export default function Counts() {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const setCountsDraft = useBadgeStore((s) => s.setCountsDraft)

  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState('')
  const [lines, setLines] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listLocations({ active: 1 }).then((d) => {
      const locs = d.locations ?? []
      setLocations(locs)
      // Land back on wherever an in-progress count was left off, rather
      // than always defaulting to the first location, so it's obvious
      // there's unfinished work waiting.
      const draft = loadDraft()
      const draftLoc = draft && locs.some((l) => String(l.id) === String(draft.locationId)) ? draft.locationId : null
      if (draftLoc) setLocationId(String(draftLoc))
      else if (locs.length) setLocationId(String(locs[0].id))
    })
  }, [])

  const loadItems = (locId) => {
    if (!locId) return
    setLoading(true)
    getCurrentStock(locId).then((d) => {
      const rows = d.items ?? []
      const draft = loadDraft()
      const draftItems = draft && String(draft.locationId) === String(locId) ? draft.items : null
      setLines(rows.map((r) => {
        const expected = Number(r.qty_on_hand) || 0
        const saved = draftItems?.[r.item_id]
        return {
          item_id: r.item_id, sku: r.sku, name: r.name, image_url: r.image_url,
          unit_of_measure: r.unit_of_measure, category_name: r.category_name, expected,
          checked: saved?.checked ?? false, counted: saved?.counted ?? String(expected), notes: saved?.notes ?? '',
        }
      }))
    }).finally(() => setLoading(false))
  }
  useEffect(() => { loadItems(locationId) }, [locationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only called from genuine user interaction (never from loadItems itself)
  // so switching locations can't misread "nothing checked in the location
  // I just switched to" as "the in-progress count elsewhere was resolved."
  const persistDraft = (ls) => {
    const checked = ls.filter((l) => l.checked)
    if (checked.length === 0) {
      clearDraft()
      setCountsDraft(false)
      return
    }
    const items = {}
    for (const l of checked) items[l.item_id] = { checked: true, counted: l.counted, notes: l.notes }
    saveDraft({ locationId, items })
    setCountsDraft(true)
  }

  const toggleLine = (itemId) => {
    const next = lines.map(l => l.item_id === itemId ? { ...l, checked: !l.checked } : l)
    setLines(next); persistDraft(next)
  }
  const setLineCounted = (itemId, val) => {
    const next = lines.map(l => l.item_id === itemId ? { ...l, counted: val } : l)
    setLines(next); persistDraft(next)
  }
  const setLineNotes = (itemId, val) => {
    const next = lines.map(l => l.item_id === itemId ? { ...l, notes: val } : l)
    setLines(next); persistDraft(next)
  }

  const visibleLines = search
    ? lines.filter(l => `${l.sku} ${l.name}`.toLowerCase().includes(search.toLowerCase()))
    : lines

  // Grouped by category, alphabetically, with anything uncategorized
  // pushed to the end — same convention as Items' category grouping.
  const uncategorizedLabel = t('items.uncategorized')
  const groupedLines = (() => {
    const map = new Map()
    for (const l of visibleLines) {
      const key = l.category_name || uncategorizedLabel
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(l)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === uncategorizedLabel) return 1
      if (b === uncategorizedLabel) return -1
      return a.localeCompare(b)
    })
  })()

  const checkedLines = lines.filter(l => l.checked)
  const mismatchedLines = checkedLines.filter(l => parseFloat(l.counted || 0) !== l.expected)

  const handleSubmit = async () => {
    if (!checkedLines.length) {
      toast.error(t('counts.checkAtLeastOne'))
      return
    }
    const msg = mismatchedLines.length > 0
      ? t('counts.confirmSummaryWithMismatches', { checked: checkedLines.length, mismatched: mismatchedLines.length })
      : t('counts.confirmSummaryAllMatch', { checked: checkedLines.length })
    if (!await confirmDialog(msg, { title: t('counts.confirmTitle'), confirmLabel: t('counts.confirmButton') })) return

    setSaving(true)
    try {
      for (const line of mismatchedLines) {
        await submitCount({
          item_id: line.item_id, location_id: locationId,
          counted_qty: parseFloat(line.counted || 0), notes: line.notes.trim() || null,
        })
      }
      toast.success(mismatchedLines.length > 0
        ? t('counts.savedWithFixes', { count: mismatchedLines.length })
        : t('counts.savedAllMatched'))
      clearDraft(); setCountsDraft(false) // this count is resolved — the bubble goes away right away, not on the next poll
      loadItems(locationId) // refresh expected values + reset the checklist for next time
    } catch (err) {
      toast.error(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full">
      <PageHeader title={t('counts.title')} subtitle={t('counts.subtitle')} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,26rem)_1fr] gap-6 items-start">
        <Card>
          <div className="flex flex-col gap-1 mb-4">
            <label className="text-sm font-medium text-gray-700">{t('counts.whereAreYouCounting')}</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
              className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="bg-brand-100 text-brand-800 rounded-xl px-4 py-3 text-sm mb-4">
            {t('counts.howItWorks')}
          </div>

          {lines.length > 0 && (
            <>
              <Input placeholder={t('items.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />

              <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                <span>{t('counts.progress', { done: checkedLines.length, total: lines.length })}</span>
                {mismatchedLines.length > 0 && <span className="text-amber-600">{t('counts.mismatchCount', { count: mismatchedLines.length })}</span>}
              </div>
            </>
          )}
        </Card>

        {loading ? (
          <Card><div className="flex justify-center py-16"><Spinner size="lg" /></div></Card>
        ) : lines.length === 0 ? (
          <Card><p className="text-sm text-gray-400 py-10 text-center">{t('counts.nothingTracked')}</p></Card>
        ) : visibleLines.length === 0 ? (
          <Card><p className="text-sm text-gray-400 py-8 text-center">{t('items.noItemsMatch')}</p></Card>
        ) : (
          <div className="flex flex-col gap-3">
            {groupedLines.map(([categoryName, categoryLines]) => (
              <CategorySection key={categoryName} title={translateCategoryName(categoryName, t)} count={categoryLines.length}>
                {categoryLines.map((line) => {
                  const countedNum = parseFloat(line.counted || 0)
                  const diff = countedNum - line.expected
                  return (
                    <div key={line.item_id} className={`rounded-xl border px-3 py-2.5 transition-colors ${line.checked ? 'border-brand-300 bg-brand-50/50' : 'border-gray-100'}`}>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={line.checked} onChange={() => toggleLine(line.item_id)} className="shrink-0 w-5 h-5" />
                        {line.image_url ? (
                          <img src={line.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-sm shrink-0">📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{line.name}</p>
                          <p className="text-xs text-gray-400">{t('counts.systemSays', { qty: line.expected, unit: line.unit_of_measure })}</p>
                        </div>
                        <input type="number" step="0.01" min="0" value={line.counted} disabled={!line.checked}
                          onChange={(e) => setLineCounted(line.item_id, e.target.value)} onClick={(e) => e.stopPropagation()}
                          className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400 shrink-0" />
                      </label>

                      {line.checked && diff !== 0 && (
                        <div className="mt-2 ml-8 flex flex-col gap-1.5">
                          <p className={`text-xs font-semibold ${diff < 0 ? 'text-amber-600' : 'text-violet-600'}`}>
                            {diff < 0 ? t('counts.fewerThanExpected', { qty: Math.abs(diff) }) : t('counts.moreThanExpected', { qty: diff })}
                          </p>
                          <input type="text" placeholder={t('counts.anyIdeaWhy')} value={line.notes}
                            onChange={(e) => setLineNotes(line.item_id, e.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:border-brand-500" />
                        </div>
                      )}
                      {line.checked && diff === 0 && (
                        <p className="mt-1 ml-8 text-xs font-semibold text-green-600">{t('counts.matches')}</p>
                      )}
                    </div>
                  )
                })}
              </CategorySection>
            ))}

            <Button onClick={handleSubmit} loading={saving} fullWidth>
              {t('counts.saveCounts')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
