import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import type { TFunction } from 'i18next'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/stores/authStore'

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset'

const RESET_LINK_WAIT_MS = 5000

function getHashParams(): Record<string, string> {
  const hash = window.location.hash?.slice(1) ?? ''
  return Object.fromEntries(new URLSearchParams(hash))
}

function getInitialMode(searchMode: string | null, hashParams: Record<string, string>): AuthMode {
  if (hashParams.type === 'recovery') return 'reset'
  if (searchMode === 'signup') return 'signup'
  return 'signin'
}

function formatAuthError(message: string | undefined, t: TFunction): string {
  const normalized = (message ?? '').toLowerCase()

  if (normalized.includes('invalid login credentials') || normalized.includes('invalid credentials')) {
    return t('auth.invalidCredentials')
  }
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return t('auth.emailAlreadyRegistered')
  }
  if (normalized.includes('invalid email')) {
    return t('auth.invalidEmail')
  }
  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return t('auth.tooManyRequests')
  }
  if (
    normalized.includes('password should be at least') ||
    normalized.includes('password must be at least') ||
    normalized.includes('weak password')
  ) {
    return t('auth.passwordTooShort')
  }

  return t('errors.generic')
}

export function AuthPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectPath = searchParams.get('redirect') || '/home'
  const { user, signOut } = useAuthStore()
  const [mode, setMode] = useState<AuthMode>(() =>
    getInitialMode(searchParams.get('mode'), getHashParams()),
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resetLinkExpired, setResetLinkExpired] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  useEffect(() => {
    const params = getHashParams()
    if (params.type === 'recovery') {
      setMode('reset')
      setError(null)
      setResetLinkExpired(false)
    }
  }, [])

  useEffect(() => {
    if (mode !== 'reset' || user !== null) return
    const timer = setTimeout(() => setResetLinkExpired(true), RESET_LINK_WAIT_MS)
    return () => clearTimeout(timer)
  }, [mode, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setError(formatAuthError(error.message, t)); return }
        navigate(redirectPath)
      } else if (mode === 'signup') {
        if (!acceptedTerms) {
          setError(t('auth.mustAcceptTerms'))
          return
        }
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) { setError(formatAuthError(error.message, t)); return }
        if (data.session) {
          const now = new Date().toISOString()
          await supabase.rpc('ensure_user_legal_acceptance', {
            p_terms_accepted_at: now,
            p_privacy_accepted_at: now,
          })
        }
        setSuccess(t('auth.checkEmailConfirm'))
        setResendMessage(null)
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        })
        if (error) { setError(formatAuthError(error.message, t)); return }
        setSuccess(t('auth.checkEmailReset'))
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          setError(t('auth.passwordsDoNotMatch'))
          return
        }
        const { error } = await supabase.auth.updateUser({ password })
        if (error) { setError(formatAuthError(error.message, t)); return }
        setSuccess(t('auth.passwordUpdated'))
        setMode('signin')
        setPassword('')
        setConfirmPassword('')
        window.history.replaceState(null, '', window.location.pathname)
      }
    } finally {
      setLoading(false)
    }
  }

  if (user && mode !== 'reset') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center">
              <img src="/FuelbotLogo.png" alt="" className="h-16 w-auto" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('app.name')}</h1>
            <p className="mt-1 text-sm text-gray-700">{t('auth.signedInAs')}</p>
            <p className="mt-1 truncate text-sm font-medium text-gray-800">{user.email ?? ''}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => void signOut()}
          >
            {t('auth.signOut')}
          </Button>
          <button
            type="button"
            onClick={() => navigate(redirectPath)}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm text-gray-700 active:bg-gray-50"
          >
            {t('auth.backToApp')}
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'reset' && user === null && !resetLinkExpired) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center">
            <img src="/FuelbotLogo.png" alt="" className="h-16 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('app.name')}</h1>
          <p role="status" aria-live="polite" className="mt-4 text-sm text-gray-700">
            {t('auth.confirmingLink')}
          </p>
          <div className="mt-6 flex justify-center" aria-hidden="true">
            <Spinner />
          </div>
          <button
            type="button"
            onClick={() => {
              setMode('signin')
              setResetLinkExpired(false)
              setError(null)
              setSuccess(null)
              window.history.replaceState(null, '', window.location.pathname)
            }}
            className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm font-medium text-gray-700 active:bg-gray-100"
          >
            {t('auth.backToSignIn')}
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'reset' && user === null && resetLinkExpired) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center">
            <img src="/FuelbotLogo.png" alt="" className="h-16 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('app.name')}</h1>
          <p className="mt-4 text-sm text-gray-700">{t('auth.resetLinkExpired')}</p>
          <button
            type="button"
            onClick={() => { setMode('signin'); setResetLinkExpired(false); setError(null); setSuccess(null); window.history.replaceState(null, '', window.location.pathname) }}
            className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm font-semibold text-blue-600 active:bg-blue-50"
          >
            {t('auth.backToSignIn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center">
            <img src="/FuelbotLogo.png" alt="" className="h-16 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {mode === 'reset' ? t('auth.setNewPasswordHeading') : t('app.name')}
          </h1>
          <p className="mt-1 text-sm text-gray-700">
            {mode === 'reset' ? t('auth.setNewPasswordInstruction') : t('app.tagline')}
          </p>
        </div>

        {/* Sign in / Sign up tabs — visible so both options are clear */}
        {(mode === 'signin' || mode === 'signup') && (
          <div className="mb-6 flex rounded-2xl bg-gray-100 p-1" role="tablist" aria-label={t('auth.signInOrSignUp')}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => { setMode('signin'); setError(null); setSuccess(null) }}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors ${mode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => { setMode('signup'); setError(null); setSuccess(null); setAcceptedTerms(false) }}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >
              {t('auth.signUp')}
            </button>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-sm font-semibold text-gray-700">
                {t('auth.email')}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ fontSize: '16px' }}
                className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-sm font-semibold text-gray-700">
                {t('auth.password')}
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ fontSize: '16px' }}
                className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); setSuccess(null) }}
                  className="mt-1.5 block text-sm font-medium text-blue-600"
                >
                  {t('auth.forgotPassword')}
                </button>
              )}
            </div>
          )}

          {mode === 'signup' && (
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="accept-terms"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked)
                  if (e.target.checked) setError(null)
                }}
                required
                aria-required="true"
                aria-describedby="accept-terms-desc"
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
              />
              <label id="accept-terms-desc" htmlFor="accept-terms" className="text-sm text-gray-700">
                <Trans
                  i18nKey="auth.acceptTermsLabel"
                  components={{
                    terms: <Link to="/terms" className="font-medium text-blue-600 underline" onClick={(e) => e.stopPropagation()} />,
                    privacy: <Link to="/privacy" className="font-medium text-blue-600 underline" onClick={(e) => e.stopPropagation()} />,
                  }}
                />
              </label>
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div>
                <label htmlFor="auth-new-password" className="mb-1.5 block text-sm font-semibold text-gray-700">
                  {t('auth.newPassword')}
                </label>
                <input
                id="auth-new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="auth-confirm-password" className="mb-1.5 block text-sm font-semibold text-gray-700">
                  {t('auth.confirmPassword')}
                </label>
                <input
                id="auth-confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="rounded-2xl bg-green-50 p-4 text-sm font-medium text-green-700">
              {success}
            </div>
          )}
          {resendMessage && (
            <div role="status" className={`rounded-2xl p-4 text-sm font-medium ${resendMessage === t('auth.resendConfirmationSent') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {resendMessage}
            </div>
          )}
          {mode === 'signup' && success && (
            <button
              type="button"
              onClick={async () => {
                setResendLoading(true)
                setResendMessage(null)
                const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
                setResendLoading(false)
                if (error) setResendMessage(t('auth.resendConfirmationError'))
                else setResendMessage(t('auth.resendConfirmationSent'))
              }}
              disabled={resendLoading}
              className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-blue-600 active:bg-blue-50 disabled:opacity-70"
            >
              {resendLoading && <Spinner />}
              {t('auth.resendConfirmation')}
            </button>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={loading}
            disabled={mode === 'signup' && !acceptedTerms}
          >
            {mode === 'signin' && t('auth.signIn')}
            {mode === 'signup' && t('auth.signUp')}
            {mode === 'forgot' && t('auth.sendResetLink')}
            {mode === 'reset' && t('auth.setNewPassword')}
          </Button>
        </form>

        {/* Large touch targets for secondary actions */}
        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); setSuccess(null) }}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm font-semibold text-blue-600 active:bg-blue-50"
          >
            {t('auth.backToSignIn')}
          </button>
        )}
        {(mode === 'signin' || mode === 'signup') && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setSuccess(null)
              setResendMessage(null)
              setAcceptedTerms(false)
            }}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm font-semibold text-blue-600 active:bg-blue-50"
          >
            {mode === 'signin' ? t('auth.signUp') : t('auth.signIn')}
          </button>
        )}
        {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
          <button
            type="button"
            onClick={() => navigate(redirectPath)}
            className="mt-1 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm text-gray-700 active:bg-gray-50"
          >
            {t('auth.continueAnonymous')}
          </button>
        )}
        {mode === 'reset' && (
          <button
            type="button"
            onClick={() => {
              setMode('signin')
              setSuccess(null)
              setError(null)
              setResetLinkExpired(false)
              window.history.replaceState(null, '', window.location.pathname)
            }}
            className="mt-1 flex min-h-[48px] w-full items-center justify-center rounded-2xl text-sm text-gray-700 active:bg-gray-50"
          >
            {t('auth.backToSignIn')}
          </button>
        )}

        {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
          <p className="mt-4 text-center text-xs text-gray-700">
            <Trans
              i18nKey="auth.agreeToTerms"
              components={{
                terms: <Link to="/terms" className="font-medium text-blue-600 underline" />,
                privacy: <Link to="/privacy" className="font-medium text-blue-600 underline" />,
              }}
            />
          </p>
        )}
      </div>
    </div>
  )
}
