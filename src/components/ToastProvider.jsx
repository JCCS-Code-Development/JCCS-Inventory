import { createContext, useCallback, useContext, useRef, useState } from 'react'

// In-app replacement for the browser's native alert() — a small dismissable,
// auto-expiring card instead of an OS-chrome popup. Stacks bottom-right on
// desktop, full-width above the mobile bottom nav on phones.
const ToastContext = createContext(null)
let nextId = 0

const VARIANT_STYLES = {
  error:   'bg-red-600 text-white',
  success: 'bg-brand-500 text-white',
  info:    'bg-gray-800 text-white',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback((message, variant, duration) => {
    const id = ++nextId
    setToasts((ts) => [...ts, { id, message, variant }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const api = useRef({
    error:   (msg, duration = 6000) => push(msg, 'error', duration),
    success: (msg, duration = 4000) => push(msg, 'success', duration),
    info:    (msg, duration = 4000) => push(msg, 'info', duration),
  }).current

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-20 lg:bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-80 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-xl shadow-lg px-4 py-3 text-sm font-medium flex items-start gap-3 ${VARIANT_STYLES[t.variant] ?? VARIANT_STYLES.info}`}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100 shrink-0" aria-label="Dismiss">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Usage: const toast = useToast(); toast.error('Could not save.')
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
