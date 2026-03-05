import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/Home/HomePage'
import { StationDetailPage } from '@/pages/Station/StationDetailPage'
import { ReportPage } from '@/pages/Report/ReportPage'
import { AdminPage } from '@/pages/Admin/AdminPage'
import { OperatorPage } from '@/pages/Operator/OperatorPage'
import { AuthPage } from '@/pages/Auth/AuthPage'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/stores/authStore'

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
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
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
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
