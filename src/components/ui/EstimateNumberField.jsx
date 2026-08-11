import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Input from './Input'
import { resolveProject } from '../../api/projects'

// A 4-digit Estimate # type-in that auto-resolves (or creates, if it's new)
// the matching project as soon as 4 digits are entered — replaces the old
// project-picker dropdown on Items (Assigned Project) and Take/Drop-off
// (Project). `onResolved` fires with the full project object, or null once
// the field no longer holds a complete 4-digit number.
export default function EstimateNumberField({
  label,
  initialNumber = '',
  initialName = '',
  onResolved,
  helperText,
}) {
  const { t } = useTranslation()
  const [digits, setDigits] = useState(initialNumber)
  const [resolved, setResolved] = useState(initialName ? { name: initialName, is_new: false } : null)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')

  const handleChange = async (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4)
    setDigits(value)
    setError('')
    if (value.length < 4) {
      setResolved(null)
      onResolved?.(null)
      return
    }
    setResolving(true)
    try {
      const project = await resolveProject(value)
      setResolved(project)
      onResolved?.(project)
    } catch (err) {
      setResolved(null)
      setError(err?.response?.data?.error ?? t('estimateField.couldNotLookUp'))
      onResolved?.(null)
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <Input value={digits} onChange={handleChange} inputMode="numeric" pattern="\d*" maxLength={4} placeholder={t('estimateField.placeholder')} />
      {resolving && <p className="text-xs text-gray-400">{t('estimateField.lookingUp')}</p>}
      {resolved && !resolving && (
        <p className="text-xs text-brand-700">
          {resolved.is_new ? t('estimateField.newEstimateCreated') : '✓'} {resolved.name}
          {resolved.client_name ? ` — ${resolved.client_name}` : ''}
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helperText && !resolved && !error && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  )
}
