export default function Card({ title, children, className = '', action }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={title || action ? 'px-5 pb-5' : 'p-5'}>{children}</div>
    </div>
  )
}
