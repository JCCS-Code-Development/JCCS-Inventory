import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectLanguage, translateText } from '../../utils/translate'

// Wraps a piece of free-typed user text (a request description, an order
// note, a discrepancy reason...) with a lightweight "See translation"
// toggle — but only when the text actually looks like it's written in the
// other language from whatever the page is currently showing in. Silent
// no-op (just renders the text) for anything too short or ambiguous to
// tell, or already matching, so it never clutters normal same-language use.
export default function TranslatableText({ text, className = '', as: Tag = 'p' }) {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const detected = useMemo(() => detectLanguage(text), [text])

  const [showingTranslation, setShowingTranslation] = useState(false)
  const [translated, setTranslated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!text) return null
  const mismatched = detected && detected !== currentLang

  const handleToggle = async () => {
    if (showingTranslation) { setShowingTranslation(false); return }
    if (translated) { setShowingTranslation(true); return }
    setLoading(true); setFailed(false)
    try {
      setTranslated(await translateText(text, detected, currentLang))
      setShowingTranslation(true)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Tag className={className}>{showingTranslation && translated ? translated : text}</Tag>
      {mismatched && (
        <button type="button" onClick={handleToggle} disabled={loading}
          className="text-xs font-semibold text-brand-500 hover:underline disabled:opacity-50 disabled:cursor-wait w-fit">
          {loading ? t('common.translating')
            : failed ? t('common.translationFailed')
            : showingTranslation ? t('common.showOriginal')
            : t('common.showTranslation')}
        </button>
      )}
    </>
  )
}
