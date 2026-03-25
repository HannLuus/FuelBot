import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/Home/HomePage'
import { StationDetailPage } from '@/pages/Station/StationDetailPage'
import { ReportPage } from '@/pages/Report/ReportPage'
import { ReportStationPickerPage } from '@/pages/Report/ReportStationPickerPage'
import { AdminPage } from '@/pages/Admin/AdminPage'
import { StationOwnerPage } from '@/pages/StationOwner/StationOwnerPage'
import { AuthPage } from '@/pages/Auth/AuthPage'
import { TermsPage } from '@/pages/Legal/TermsPage'
import { PrivacyPage } from '@/pages/Legal/PrivacyPage'
import { BenefitsStationPage } from '@/pages/Benefits/BenefitsStationPage'
import { BenefitsFleetPage } from '@/pages/Benefits/BenefitsFleetPage'
import { B2BPage } from '@/pages/B2B/B2BPage'
import { EarnPage } from '@/pages/Earn/EarnPage'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/stores/authStore'
import { LandingPage } from '@/pages/Landing/LandingPage'
import { ContactPage } from '@/pages/Contact/ContactPage'

// Lazy-load the map to keep it out of the initial bundle
const MapPage = lazy(() =>
  import('@/pages/Map/MapPage').then((m) => ({ default: m.MapPage })),
)

/** Preserves query string (e.g. ?ref=) when redirecting legacy /operator URLs. */
function RedirectLegacyOperatorToStation() {
  const [searchParams] = useSearchParams()
  const q = searchParams.toString()
  return <Navigate to={{ pathname: '/station', search: q ? `?${q}` : undefined }} replace />
}

function RedirectLegacyStationClaimPath() {
  const { stationId } = useParams<{ stationId: string }>()
  const [searchParams] = useSearchParams()
  const q = searchParams.toString()
  const search = q ? `?${q}` : ''
  if (!stationId) {
    return <Navigate to={{ pathname: '/station', search: q ? `?${q}` : undefined }} replace />
  }
  return <Navigate to={`/station/claim/${stationId}${search}`} replace />
}

/** /station/claim without :stationId was matching /station/:id with id "claim". */
function RedirectIncompleteStationClaimPath() {
  const [searchParams] = useSearchParams()
  const q = searchParams.toString()
  return <Navigate to={{ pathname: '/station', search: q ? `?${q}` : undefined }} replace />
}

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
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/benefits/station-owners" element={<BenefitsStationPage />} />
        <Route path="/benefits/fleet-owners" element={<BenefitsFleetPage />} />
        <Route element={<AppLayout />}>
          <Route path="/home" element={<HomePage />} />
          {/** More specific /station/claim/* before /station/:id so "claim" is not captured as :id */}
          <Route path="/station/claim/:stationId" element={<StationOwnerPage />} />
          <Route path="/station/claim" element={<RedirectIncompleteStationClaimPath />} />
          <Route path="/station/:id" element={<StationDetailPage />} />
          <Route path="/station" element={<StationOwnerPage />} />
          <Route path="/report" element={<ReportStationPickerPage />} />
          <Route path="/report/:id" element={<ReportPage />} />
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
          <Route path="/operator" element={<RedirectLegacyOperatorToStation />} />
          <Route path="/operator/claim/:stationId" element={<RedirectLegacyStationClaimPath />} />
          <Route path="/earn" element={<EarnPage />} />
          <Route path="/b2b" element={<B2BPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
