import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'

function GuardMessage({
  title,
  actionLabel,
  actionHref,
}: {
  title: string
  actionLabel: string
  actionHref: string
}) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-gray-700" />
        <p className="mb-3 text-gray-700">{title}</p>
        <Button onClick={() => { window.location.href = actionHref }}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

export function RequireAuth() {
  const { t } = useTranslation()
  const location = useLocation()
  const { user, loading } = useAuthStore()

  if (loading) {
    return null
  }
  if (!user) {
    return (
      <GuardMessage
        title={t('auth.signIn')}
        actionLabel={t('auth.signIn')}
        actionHref={`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`}
      />
    )
  }
  return <Outlet />
}

export function RequireAdmin() {
  const { t } = useTranslation()
  const { user, isAdmin, loading } = useAuthStore()

  if (loading) {
    return null
  }
  if (!user) {
    return <Navigate to="/auth?redirect=/admin" replace />
  }
  if (!isAdmin) {
    return (
      <GuardMessage
        title={t('admin.accessRequired')}
        actionLabel={t('nav.nearby')}
        actionHref="/home"
      />
    )
  }
  return <Outlet />
}
