import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from './ui/Modal'
import Button from './ui/Button'

// In-app replacement for the browser's native confirm() — same "localhost:5183
// says…" chrome popup FieldClock never shows either. Renders through the
// existing Modal so it matches the rest of the app instead of looking like
// a browser alert. useConfirm() returns a Promise<boolean>, same call shape
// as confirm() just async: `if (!await confirmDialog('Delete this?')) return`.
const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirmAction = useCallback((message, opts = {}) => {
    setState({
      message,
      title: opts.title ?? 'Please confirm',
      confirmLabel: opts.confirmLabel ?? 'OK',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false,
    })
    return new Promise((resolve) => { resolver.current = resolve })
  }, [])

  const close = (result) => {
    resolver.current?.(result)
    resolver.current = null
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <Modal isOpen={!!state} onClose={() => close(false)} title={state?.title ?? ''} size="sm">
        {state && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600 whitespace-pre-line">{state.message}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => close(false)}>{state.cancelLabel}</Button>
              <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state.confirmLabel}</Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  )
}

// Usage: const confirmDialog = useConfirm(); if (!await confirmDialog('Sure?')) return
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
