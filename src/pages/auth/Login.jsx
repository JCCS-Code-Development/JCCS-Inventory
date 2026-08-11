import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import LangSwitcher from '../../components/ui/LangSwitcher'
import { login as fieldclockLogin } from '../../api/fieldclockAuth'
import { verify as verifyInventoryAccess } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login: storeLogin, logout: storeLogout } = useAuthStore()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!identifier.trim()) { setError(t('auth.enterIdentifier')); return }
    setLoading(true)
    setError('')
    try {
      // Step 1 — authenticate against FieldClock's existing login. Inventory has
      // no accounts of its own; this is the same identifier/password JCCS staff
      // already use for FieldClock.
      const data = await fieldclockLogin(identifier.trim(), password)
      if (data.setup_required) {
        setError(t('auth.setupRequired'))
        return
      }

      // Step 2 — stash the token so the verify call below can send it, then ask
      // Inventory's own API whether this user is provisioned here and what role
      // they have (admin/staff is independent of FieldClock's role field).
      storeLogin(data.user, data.token, data.refreshToken)
      const access = await verifyInventoryAccess()
      storeLogin({ ...data.user, role: access.role }, data.token, data.refreshToken)
      navigate('/', { replace: true })
    } catch (err) {
      storeLogout()
      if (err?.response?.status === 403) {
        setError(t('auth.notProvisioned'))
      } else {
        setError(err?.response?.data?.error ?? t('auth.signInFailed'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-brand-900 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-14 w-auto mx-auto mb-4"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <h1 className="text-2xl font-bold text-white">{t('auth.appName')}</h1>
          <p className="text-brand-100/70 text-sm mt-1">{t('auth.signInSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <Input
            label={t('auth.emailOrPhone')}
            type="text"
            inputMode="email"
            placeholder="you@jccs-services.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
          <Input
            label={t('auth.password')}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            autoComplete="current-password"
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            {t('auth.signIn')}
          </Button>
        </form>

        <p className="text-center text-brand-100/50 text-xs mt-6">
          {t('auth.noAccess')}
        </p>

        <div className="flex justify-center mt-4">
          <LangSwitcher className="text-brand-100/40 hover:text-brand-100/80" />
        </div>
      </div>
    </div>
  )
}
