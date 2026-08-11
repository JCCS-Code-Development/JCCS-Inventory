import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const { t } = useTranslation()
  const isOnline = useOnlineStatus()
  if (isOnline) return null
  return (
    <div className="bg-amber-500 text-white text-sm font-semibold text-center py-2 px-4 fixed top-0 inset-x-0 z-40">
      ⚠️ {t('offlineBanner.message')}
    </div>
  )
}
