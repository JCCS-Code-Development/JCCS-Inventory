import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { BrowserMultiFormatReader } from '@zxing/browser'

// Full-screen camera scanner. Reads UPC/EAN/Code128/QR via the device camera
// — works on iOS Safari and Android Chrome alike since it decodes frames
// itself (getUserMedia + canvas) rather than relying on the native
// BarcodeDetector API, which Safari doesn't support.
//
// Loaded via React.lazy() by every page that uses it (Items, Take/Drop-off,
// Receiving) — mounting this component IS the "open" signal, so the
// ~470KB decoding library only downloads once someone actually taps Scan,
// not on every page load.
export default function BarcodeScanner({ onClose, onDetected }) {
  const { t } = useTranslation()
  const videoRef = useRef(null)
  const [error, setError] = useState('')

  // Keep the latest callback in a ref so the scanning effect below only ever
  // runs once on mount — otherwise a new onDetected reference on every
  // parent render would tear down and restart the camera stream constantly.
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let cancelled = false
    let fired = false // the decode callback fires every frame — only act on the first hit

    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      (result) => {
        if (cancelled || fired) return
        if (result) { fired = true; onDetectedRef.current(result.getText()) }
        // NotFoundException fires continuously between frames with no
        // barcode in view — that's normal, not an error to surface.
      }
    ).catch((err) => {
      if (cancelled) return
      setError(
        err?.name === 'NotAllowedError'
          ? t('barcodeScanner.accessDenied')
          : t('barcodeScanner.couldNotStart')
      )
    })

    return () => {
      cancelled = true
      try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount by design; t() staleness on a mid-scan language switch is a non-issue
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="font-semibold text-sm">{t('barcodeScanner.title')}</p>
        <button onClick={onClose} className="p-2 -mr-2">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        {!error && (
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 aspect-[3/1.6] rounded-2xl pointer-events-none"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}>
            {/* Corner brackets — the rest of the frame is dimmed by the box-shadow above */}
            {[
              'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
              'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
              'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
              'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
            ].map((pos) => (
              <div key={pos} className={`absolute w-8 h-8 border-white/90 ${pos}`} />
            ))}
          </div>
        )}
        {error && (
          <div className="absolute inset-x-6 text-center">
            <p className="text-white text-sm bg-black/60 rounded-xl px-4 py-3">{error}</p>
          </div>
        )}
      </div>

      <p className="text-white/60 text-xs text-center py-4 px-6">
        {t('barcodeScanner.hint')}
      </p>
    </div>,
    document.body
  )
}
