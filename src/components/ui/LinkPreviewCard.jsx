import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLinkPreview } from '../../api/requests'

// A small "what this link leads to" card — title/image pulled server-side
// from the page's Open Graph tags. Debounced so it doesn't fire on every
// keystroke while someone's still typing/pasting the URL; silently falls
// back to a plain link if the fetch fails or the page has no useful tags,
// rather than showing an error over something cosmetic.
export default function LinkPreviewCard({ url, className = '' }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const valid = !!url && /^https?:\/\/.+/i.test(url.trim())

  useEffect(() => {
    if (!valid) { setPreview(null); setFailed(false); return }
    setLoading(true); setFailed(false)
    const handle = setTimeout(() => {
      getLinkPreview(url.trim())
        .then((data) => setPreview(data?.title || data?.image ? data : null))
        .catch(() => setFailed(true))
        .finally(() => setLoading(false))
    }, 600)
    return () => clearTimeout(handle)
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps -- `valid` is derived from `url`

  if (!valid) return null

  return (
    <a href={url.trim()} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors p-2 ${className}`}>
      {loading ? (
        <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse shrink-0" />
      ) : preview?.image ? (
        <img src={preview.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-lg shrink-0">🔗</div>
      )}
      <div className="min-w-0 flex-1">
        {loading ? (
          <p className="text-xs text-gray-400">{t('requests.loadingPreview')}</p>
        ) : preview?.title ? (
          <>
            <p className="text-sm font-medium text-gray-900 truncate">{preview.title}</p>
            <p className="text-xs text-gray-500 truncate">{preview.site_name || url}</p>
          </>
        ) : (
          <p className="text-sm text-brand-600 truncate">{failed ? t('requests.viewProductLink') : url}</p>
        )}
      </div>
    </a>
  )
}
