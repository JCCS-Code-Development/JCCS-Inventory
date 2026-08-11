import { createPortal } from 'react-dom'
import Spinner from './Spinner'

// Shown by <Suspense> while the lazy-loaded BarcodeScanner chunk downloads.
export default function ScannerLoading() {
  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-black flex items-center justify-center text-white">
      <Spinner size="lg" />
    </div>,
    document.body
  )
}
