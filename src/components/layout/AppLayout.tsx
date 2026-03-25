import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { List, Map, PlusCircle, Fuel, ShieldCheck, Globe, User, X, LogIn, LogOut, Truck, Gift } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/authStore'
import { useAdminPendingCount } from '@/hooks/useAdminPendingCount'
import { useState, useEffect } from 'react'
import { useRoleAccess, type AppRole } from '@/hooks/useRoleAccess'
import { useFilterStore } from '@/stores/filterStore'

export function AppLayout() {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuthStore()
  const { activeRole, setActiveRole, availableRoles } = useRoleAccess()
  const { filters, setMaxDistance, setSelectedRouteId } = useFilterStore()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const adminCounts = useAdminPendingCount()

  useEffect(() => {
    if (!sheetOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sheetOpen])

  function toggleLang() {
    const next = i18n.language === 'en' ? 'my' : 'en'
    void i18n.changeLanguage(next)
    localStorage.setItem('fuelbot_lang', next)
  }

  const navItems = [
    { to: '/home', label: t('nav.nearby'), icon: List, end: true },
    { to: '/map', label: t('nav.map'), icon: Map },
    ...(activeRole === 'general' ? [{ to: '/earn', label: t('nav.earn'), icon: Gift }] : []),
    ...(activeRole === 'fleet' ? [{ to: '/b2b', label: t('nav.routeAccess'), icon: Truck }] : []),
    ...(activeRole === 'station' ? [{ to: '/station', label: t('nav.station'), icon: Fuel }] : []),
    ...(activeRole === 'admin' ? [{ to: '/admin', label: t('nav.admin'), icon: ShieldCheck }] : []),
  ]

  function roleLabel(role: AppRole) {
    switch (role) {
      case 'general':
        return t('common.generalMode')
      case 'station':
        return t('common.stationMode')
      case 'fleet':
        return t('common.fleetMode')
      case 'admin':
        return t('common.adminMode')
      default: {
        const exhaustive: never = role
        return exhaustive
      }
    }
  }

  return (
    <div className="flex h-full max-h-screen flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 shadow-sm" style={{ minHeight: '52px' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 min-h-[44px]"
        >
          <img src="/FuelbotLogo.png" alt="" className="h-8 w-auto" />
          <span className="text-base font-bold text-gray-900">{t('app.name')}</span>
        </button>

        <div className="flex items-center gap-0.5">
          {/* Language toggle — 44×44 hit area */}
          <button
            type="button"
            onClick={toggleLang}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm font-semibold text-gray-700 active:bg-gray-100"
            aria-label={t('common.toggleLanguage')}
          >
            {i18n.language === 'en' ? 'မြ' : 'EN'}
          </button>

          {/* User menu trigger — 44×44 hit area */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl active:bg-gray-100"
            aria-label={t('common.userMenu')}
          >
            <User className="h-5 w-5 text-gray-700" />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Bottom nav — 52px items + safe area */}
      <nav className="shrink-0 border-t border-gray-100 bg-white pb-safe">
        <div className="flex">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2.5 text-xs transition-colors active:bg-gray-50',
                  isActive ? 'text-blue-600' : 'text-gray-700',
                )
              }
              style={{ minHeight: '52px' }}
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon className={clsx('h-6 w-6', isActive && 'scale-110 transition-transform')} />
                    {to === '/admin' && adminCounts.total > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {adminCounts.total > 9 ? '9+' : adminCounts.total}
                      </span>
                    )}
                  </span>
                  <span className={clsx('mt-0.5 font-medium', isActive && 'font-bold')}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {activeRole === 'general' && (
            <NavLink
              to="/report"
              className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 pb-1.5 pt-1 text-xs text-blue-600 active:opacity-80"
              style={{ minHeight: '52px' }}
            >
              <div className="-mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-200 transition-transform active:scale-95">
                <PlusCircle className="h-6 w-6 text-white" />
              </div>
              <span className="mt-0.5 font-bold">{t('nav.report')}</span>
            </NavLink>
          )}
        </div>
      </nav>

      {/* Footer */}
      <footer className="shrink-0 border-t border-gray-100 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-700">
          <Link to="/" className="font-medium text-blue-600 underline active:text-blue-700">
            {t('common.landingPage')}
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms" className="hover:underline active:text-gray-900">
            {t('legal.termsOfService')}
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="hover:underline active:text-gray-900">
            {t('legal.privacyPolicy')}
          </Link>
        </div>
      </footer>

      {/* Bottom sheet — replaces small dropdown for menu */}
      {sheetOpen && (
        <>
          {/* Backdrop */}
          <div
            role="button"
            tabIndex={0}
            aria-label={t('common.close')}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setSheetOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSheetOpen(false)
              }
            }}
          />
          {/* Sheet */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('common.userMenu')}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white pb-safe shadow-2xl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* User info */}
            {user && (
              <div className="border-b border-gray-100 px-6 py-3">
                <p className="text-xs text-gray-700">{t('auth.signedInAs')}</p>
                <p className="truncate text-sm font-medium text-gray-800">{user.email ?? ''}</p>
                <p className="mt-1 text-xs text-gray-700">
                  {t('common.currentMode')}: {roleLabel(activeRole)}
                </p>
              </div>
            )}

            {/* Sheet actions — all 56px tall for easy thumb tap */}
            <div className="px-4 py-2">
              <Link
                to="/"
                onClick={() => setSheetOpen(false)}
                className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
              >
                <img src="/FuelbotLogo.png" alt="" className="h-5 w-5 shrink-0 object-contain" />
                <span>{t('common.homePage')}</span>
              </Link>

              {user && availableRoles.length > 1 && (
                <div className="px-3 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                    {t('common.roleMode')}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {availableRoles.map((role) => {
                      const selected = role === activeRole
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => {
                            if (role !== 'fleet') {
                              setSelectedRouteId(null)
                              if (filters.maxDistanceKm > 100) {
                                setMaxDistance(25)
                              }
                            }
                            setActiveRole(role)
                            setSheetOpen(false)
                            switch (role) {
                              case 'general':
                                navigate('/home')
                                break
                              case 'station':
                                navigate('/station')
                                break
                              case 'fleet':
                                navigate('/b2b')
                                break
                              case 'admin':
                                navigate('/admin')
                                break
                              default: {
                                const exhaustive: never = role
                                return exhaustive
                              }
                            }
                          }}
                          className={clsx(
                            'rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors',
                            selected
                              ? 'border-blue-300 bg-blue-50 text-blue-900'
                              : 'border-gray-200 bg-white text-gray-800 active:bg-gray-100',
                          )}
                        >
                          {roleLabel(role)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => { toggleLang(); setSheetOpen(false) }}
                className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
              >
                <Globe className="h-5 w-5 text-gray-700 shrink-0" />
                <span>{i18n.language === 'en' ? t('common.switchToMyanmar') : t('common.switchToEnglish')}</span>
              </button>

              <Link
                to="/terms"
                onClick={() => setSheetOpen(false)}
                className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
              >
                <span>{t('legal.termsAndPrivacy')}</span>
              </Link>

              {activeRole === 'general' && (
                <Link
                  to="/earn"
                  onClick={() => setSheetOpen(false)}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
                >
                  <Gift className="h-5 w-5 shrink-0 text-gray-700" />
                  <span>{t('nav.earn')}</span>
                </Link>
              )}

              {activeRole === 'fleet' && (
                <Link
                  to="/b2b"
                  onClick={() => setSheetOpen(false)}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
                >
                  <Truck className="h-5 w-5 shrink-0 text-gray-700" />
                  <span>{t('b2b.title')}</span>
                </Link>
              )}

              {activeRole === 'station' && (
                <Link
                  to="/station"
                  onClick={() => setSheetOpen(false)}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
                >
                  <Fuel className="h-5 w-5 shrink-0 text-gray-700" />
                  <span>{t('stationOwner.title')}</span>
                </Link>
              )}

              {user && !availableRoles.includes('station') && (
                <Link
                  to="/station"
                  onClick={() => setSheetOpen(false)}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
                >
                  <Fuel className="h-5 w-5 shrink-0 text-gray-700" />
                  <span>{t('stationOwner.title')}</span>
                </Link>
              )}

              {user && !availableRoles.includes('fleet') && (
                <Link
                  to="/b2b"
                  onClick={() => setSheetOpen(false)}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
                >
                  <Truck className="h-5 w-5 shrink-0 text-gray-700" />
                  <span>{t('b2b.title')}</span>
                </Link>
              )}

              {activeRole === 'admin' && (
                <Link
                  to="/admin"
                  onClick={() => setSheetOpen(false)}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
                >
                  <ShieldCheck className="h-5 w-5 shrink-0 text-gray-700" />
                  <span>{t('nav.admin')}</span>
                </Link>
              )}

              {user ? (
                <button
                  type="button"
                  onClick={() => { void signOut(); setSheetOpen(false) }}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-red-600 active:bg-red-50"
                >
                  <LogOut className="h-5 w-5 text-red-400 shrink-0" />
                  <span>{t('auth.signOut')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { navigate('/auth'); setSheetOpen(false) }}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-blue-600 active:bg-blue-50"
                >
                  <LogIn className="h-5 w-5 text-blue-400 shrink-0" />
                  <span>{t('auth.signIn')}</span>
                </button>
              )}
            </div>

            {/* Close button */}
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-100 py-4 text-sm font-semibold text-gray-700 active:bg-gray-200"
              >
                <X className="h-4 w-4" />
                {t('common.close')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
