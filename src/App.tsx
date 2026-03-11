import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/Home/HomePage'
import { StationDetailPage } from '@/pages/Station/StationDetailPage'
import { ReportPage } from '@/pages/Report/ReportPage'
import { AdminPage } from '@/pages/Admin/AdminPage'
import { OperatorPage } from '@/pages/Operator/OperatorPage'
import { AuthPage } from '@/pages/Auth/AuthPage'
import { TermsPage } from '@/pages/Legal/TermsPage'
import { PrivacyPage } from '@/pages/Legal/PrivacyPage'
import { BenefitsStationPage } from '@/pages/Benefits/BenefitsStationPage'
import { BenefitsFleetPage } from '@/pages/Benefits/BenefitsFleetPage'
import { B2BPage } from '@/pages/B2B/B2BPage'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/stores/authStore'
import { LandingPage } from '@/pages/Landing/LandingPage'

// Lazy-load the map to keep it out of the initial bundle
const MapPage = lazy(() =>
  import('@/pages/Map/MapPage').then((m) => ({ default: m.MapPage })),
)

export default function App() {
  const { init } = useAuthStore()

  useEffect(() => {
    init()
  }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/benefits/station-owners" element={<BenefitsStationPage />} />
        <Route path="/benefits/fleet-owners" element={<BenefitsFleetPage />} />
        <Route element={<AppLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/station/:id" element={<StationDetailPage />} />
          <Route path="/report/:id?" element={<ReportPage />} />
          <Route
            path="/map"
            element={
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Spinner />
                  </div>
                }
              >
                <MapPage />
              </Suspense>
            }
          />
          <Route path="/operator" element={<OperatorPage />} />
          <Route path="/operator/claim/:stationId" element={<OperatorPage />} />
          <Route path="/b2b" element={<B2BPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
