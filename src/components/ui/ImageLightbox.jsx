import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// A full-screen "see this bigger" viewer for a single photo — deliberately
// not the standard Modal (that's a white card with a title bar, which eats
// into exactly the space a photo needs). Click the backdrop, hit Escape, or
// tap the close button to dismiss; clicking the image itself does nothing.
export default function ImageLightbox({ src, alt = '', onClose }) {
  useEffect(() => {
    if (!src) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [src, onClose])

  if (!src) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
      />
    </div>,
    document.body
  )
}
