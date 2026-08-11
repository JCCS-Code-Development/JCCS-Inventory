import { format, parseISO } from 'date-fns'

export const formatDate     = (iso) => iso ? format(parseISO(iso), 'MMM d, yyyy')        : '—'
export const formatDateTime = (iso) => iso ? format(parseISO(iso), 'MMM d, yyyy h:mm a') : '—'

export const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

export const formatQty = (n, unit) => `${Number(n ?? 0).toLocaleString()}${unit ? ` ${unit}` : ''}`
