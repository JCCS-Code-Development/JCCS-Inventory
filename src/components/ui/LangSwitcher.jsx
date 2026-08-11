import { useTranslation } from 'react-i18next'

// Same toggle as FieldClock's LangSwitcher. Inventory has no server-side
// per-user language preference (no shared DB with FieldClock, no such
// endpoint here), so this is localStorage-only via i18next-browser-languagedetector.
export default function LangSwitcher({ className = '' }) {
  const { i18n, t } = useTranslation()

  const toggle = () => {
    const next = i18n.language.startsWith('es') ? 'en' : 'es'
    i18n.changeLanguage(next)
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 text-xs font-semibold tracking-widest uppercase transition-colors ${className}`}
      title={t('lang.switchTo')}
    >
      <span className="opacity-60">{t('lang.current')}</span>
      <span className="opacity-30">|</span>
      <span className="opacity-100">{t('lang.switchTo')}</span>
    </button>
  )
}
