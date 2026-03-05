import { Outlet, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { List, Map, PlusCircle, Store, ShieldCheck, Zap, Globe, User, X, LogIn, LogOut } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export function AppLayout() {
  const { t, i18n } = useTranslation()
  const { user, isAdmin, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)

  function toggleLang() {
    const next = i18n.language === 'en' ? 'my' : 'en'
    void i18n.changeLanguage(next)
    localStorage.setItem('fuelbot_lang', next)
  }

  const navItems = [
    { to: '/', label: t('nav.nearby'), icon: List, end: true },
    { to: '/map', label: t('nav.map'), icon: Map },
    { to: '/operator', label: t('nav.operator'), icon: Store },
    ...(isAdmin ? [{ to: '/admin', label: t('nav.admin'), icon: ShieldCheck }] : []),
  ]

  return (
    <div className="flex h-full max-h-screen flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 shadow-sm" style={{ minHeight: '52px' }}>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 min-h-[44px]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold text-gray-900">{t('app.name')}</span>
        </button>

        <div className="flex items-center gap-0.5">
          {/* Language toggle — 44×44 hit area */}
          <button
            onClick={toggleLang}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm font-semibold text-gray-700 active:bg-gray-100"
            aria-label="Toggle language"
          >
            {i18n.language === 'en' ? 'မြ' : 'EN'}
          </button>

          {/* User menu trigger — 44×44 hit area */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl active:bg-gray-100"
            aria-label="User menu"
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
                  <Icon className={clsx('h-6 w-6', isActive && 'scale-110 transition-transform')} />
                  <span className={clsx('mt-0.5 font-medium', isActive && 'font-bold')}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* Report button — prominent FAB lifted above nav */}
          <NavLink
            to="/report"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 pb-1.5 pt-1 text-xs text-blue-600 active:opacity-80"
            style={{ minHeight: '52px' }}
          >
            <div className="-mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-200 active:scale-95 transition-transform">
              <PlusCircle className="h-6 w-6 text-white" />
            </div>
            <span className="mt-0.5 font-bold">{t('nav.report')}</span>
          </NavLink>
        </div>
      </nav>

      {/* Bottom sheet — replaces small dropdown for menu */}
      {sheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setSheetOpen(false)}
          />
          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white pb-safe shadow-2xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* User info */}
            {user && (
              <div className="border-b border-gray-100 px-6 py-3">
                <p className="text-xs text-gray-700">Signed in as</p>
                <p className="truncate text-sm font-medium text-gray-800">{user.email}</p>
              </div>
            )}

            {/* Sheet actions — all 56px tall for easy thumb tap */}
            <div className="px-4 py-2">
              <button
                onClick={() => { toggleLang(); setSheetOpen(false) }}
                className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-gray-800 active:bg-gray-100"
              >
                <Globe className="h-5 w-5 text-gray-700 shrink-0" />
                <span>{i18n.language === 'en' ? 'Switch to မြန်မာ' : 'Switch to English'}</span>
              </button>

              {user ? (
                <button
                  onClick={() => { void signOut(); setSheetOpen(false) }}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left text-base font-medium text-red-600 active:bg-red-50"
                >
                  <LogOut className="h-5 w-5 text-red-400 shrink-0" />
                  <span>{t('auth.signOut')}</span>
                </button>
              ) : (
                <button
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
                onClick={() => setSheetOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-100 py-4 text-sm font-semibold text-gray-700 active:bg-gray-200"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
