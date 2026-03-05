import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

export function AuthPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setError(error.message); return }
        navigate('/')
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) { setError(error.message); return }
        setSuccess('Check your email to confirm your account.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('app.name')}</h1>
          <p className="mt-1 text-sm text-gray-700">{t('app.tagline')}</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              {t('auth.email')}
            </label>
            {/* font-size 16px required — prevents iOS zoom on focus */}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ fontSize: '16px' }}
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              {t('auth.password')}
            </label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ fontSize: '16px' }}
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl bg-green-50 p-4 text-sm font-medium text-green-700">
              {success}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
          </Button>
        </form>

        {/* Large touch targets for secondary actions */}
        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm font-semibold text-blue-600 active:bg-blue-50"
        >
          {mode === 'signin' ? t('auth.signUp') : t('auth.signIn')}
        </button>

        <button
          onClick={() => navigate('/')}
          className="mt-1 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm text-gray-700 active:bg-gray-50"
        >
          {t('auth.continueAnonymous')}
        </button>
      </div>
    </div>
  )
}
