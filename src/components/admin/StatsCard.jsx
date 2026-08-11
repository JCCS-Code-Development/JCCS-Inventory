export default function StatsCard({ label, value, icon, color = 'blue', onClick, compact = false }) {
  const colors = {
    brand:  'bg-brand-100 text-brand-700',
    amber:  'bg-amber-50  text-amber-600',
    red:    'bg-red-50    text-red-600',
    green:  'bg-green-50  text-green-600',
    blue:   'bg-blue-50   text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    sky:    'bg-sky-50    text-sky-600',
  }
  const cls = colors[color] ?? colors.brand
  const base = `bg-white rounded-2xl border border-gray-100 flex items-center ${onClick ? 'cursor-pointer hover:border-brand-300 transition-colors' : ''}`

  if (compact) {
    return (
      <div className={`${base} p-3 gap-3`} onClick={onClick}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900 leading-none truncate">{value}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${base} p-5 gap-4`} onClick={onClick}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
