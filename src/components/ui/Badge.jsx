const variants = {
  // Genuine stock-health signal — kept as a real traffic light (not brand-colored)
  // so low/out-of-stock still jumps out at a glance.
  in_stock:         'bg-green-100 text-green-800',
  low_stock:        'bg-amber-100 text-amber-800',
  out_of_stock:     'bg-red-100 text-red-800',
  // Everything else is just categorical, so it follows the brand palette.
  receive:          'bg-brand-100 text-brand-800',
  count_adjustment: 'bg-violet-100 text-violet-800',
  checkout:         'bg-sky-100 text-sky-800',
  checkin:          'bg-teal-100 text-teal-800',
  active:           'bg-brand-100 text-brand-800',
  inactive:         'bg-gray-100 text-gray-500',
  // Order statuses
  awaiting_item_setup: 'bg-orange-100 text-orange-800',
  placed:             'bg-blue-100 text-blue-800',
  partially_received: 'bg-amber-100 text-amber-800',
  received:           'bg-green-100 text-green-800',
  cancelled:          'bg-gray-100 text-gray-500',
  // Order type
  online:  'bg-sky-100 text-sky-800',
  dropoff: 'bg-violet-100 text-violet-800',
  // Order request (ticket) status
  request_open:     'bg-amber-100 text-amber-800',
  request_ordered:  'bg-green-100 text-green-800',
  request_declined: 'bg-gray-100 text-gray-500',
}

export default function Badge({ variant = 'active', children, className = '' }) {
  const style = variants[variant] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${style} ${className}`}>
      {children}
    </span>
  )
}
