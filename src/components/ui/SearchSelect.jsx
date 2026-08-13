import { useTranslation } from 'react-i18next'

// "Type to search, pick from matches, selected shows as a chip you can
// change" — same interaction as the FieldClock-directory picker on the
// Users page, pulled out into a shared shell since Vendor/Item pickers
// need the exact same thing. Options are matched client-side by the
// caller (everything relevant is already loaded in full elsewhere in this
// app, so no extra round-trip per keystroke). `renderCreate`, when given,
// renders below the results whenever there's a search query — fully up to
// the caller what "create new" actually looks like (a vendor just needs a
// name; an item needs a SKU too), this shell doesn't know or care.
export default function SearchSelect({
  selected, // {id, label, sublabel?} | null
  onClear,
  search, onSearchChange,
  results, // [{id, label, sublabel?}]
  onPick,
  placeholder,
  renderCreate,
}) {
  const { t } = useTranslation()
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-300 bg-brand-50/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{selected.label}</p>
          {selected.sublabel && <p className="text-xs text-gray-500 truncate">{selected.sublabel}</p>}
        </div>
        <button type="button" onClick={onClear} className="text-xs font-semibold text-gray-400 hover:text-gray-600 shrink-0">{t('common.change')}</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input type="text" placeholder={placeholder} value={search} onChange={(e) => onSearchChange(e.target.value)}
        className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      {search.trim() && (
        <div className="flex flex-col gap-1 rounded-xl border border-gray-100 p-1.5">
          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => onPick(r)}
                  className="text-left rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  {r.sublabel && <p className="text-xs text-gray-400">{r.sublabel}</p>}
                </button>
              ))}
            </div>
          )}
          {renderCreate}
        </div>
      )}
    </div>
  )
}
