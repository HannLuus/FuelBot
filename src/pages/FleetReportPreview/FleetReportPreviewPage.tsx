import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Download,
  Printer,
  Truck,
  TrendingDown,
  TrendingUp,
  Minus,
  BarChart3,
  Users,
  Factory,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getDemoFleetReport, type DemoFleetTruck, type FleetTruckStatus } from './demoFleetReportData'
import { buildFleetReportCsv, downloadCsv } from './fleetReportCsv'

function formatMmk(value: number): string {
  return value.toLocaleString('en-US')
}

function StatusBadge({ status }: { status: FleetTruckStatus }) {
  const { t } = useTranslation()
  const config: Record<FleetTruckStatus, { icon: typeof TrendingDown; className: string; label: string }> = {
    better: {
      icon: TrendingDown,
      className: 'bg-green-100 text-green-800',
      label: t('fleetReport.statusBetter'),
    },
    average: {
      icon: Minus,
      className: 'bg-gray-100 text-gray-700',
      label: t('fleetReport.statusAverage'),
    },
    worse: {
      icon: TrendingUp,
      className: 'bg-amber-100 text-amber-900',
      label: t('fleetReport.statusWorse'),
    },
  }
  const { icon: Icon, className, label } = config[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}

function TruckCard({ truck }: { truck: DemoFleetTruck }) {
  const { t } = useTranslation()
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm print:break-inside-avoid">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900">{truck.label}</p>
          <p className="text-sm text-gray-700">
            {truck.manufacturer} {truck.model} · {truck.year}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {truck.driver} · {truck.region}
          </p>
        </div>
        <StatusBadge status={truck.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-gray-600">{t('fleetReport.colDistance')}</dt>
          <dd className="font-semibold text-gray-900">
            {truck.distanceKm.toLocaleString()} {t('garage.km')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">{t('fleetReport.colLiters')}</dt>
          <dd className="font-semibold text-gray-900">
            {truck.liters.toLocaleString()} {t('garage.litersShort')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">{t('fleetReport.colCost')}</dt>
          <dd className="font-semibold text-gray-900">{formatMmk(truck.costMmk)} MMK</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">{t('fleetReport.colEfficiency')}</dt>
          <dd className="font-semibold text-blue-900">
            {truck.lPer100km.toFixed(1)} {t('garage.lPer100km')}
          </dd>
        </div>
      </dl>
    </article>
  )
}

export function FleetReportPreviewPage() {
  const { t } = useTranslation()
  const report = getDemoFleetReport()
  const { summary, trucks, likeForLike, peerBenchmark, manufacturerInsight } = report

  function handlePrint() {
    window.print()
  }

  function handleDownloadCsv() {
    const csv = buildFleetReportCsv(report)
    downloadCsv(csv, 'fuelbot-fleet-report-sample.csv')
  }

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-gray-800 active:opacity-80">
            <img src="/FuelbotLogo.png" alt="" className="h-8 w-auto" />
            <span className="font-bold">{t('app.name')}</span>
          </Link>
          <Link
            to="/benefits/fleet-owners"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('fleetReport.back')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
        {/* Hero / sample banner */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 print:hidden">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
            {t('fleetReport.sampleBadge')}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">{t('fleetReport.title')}</h1>
          <p className="mt-2 text-base leading-relaxed text-gray-700 sm:text-lg">{t('fleetReport.subtitle')}</p>
        </section>

        {/* Print-only header */}
        <div className="hidden print:block print:mb-6 print:border-b print:border-gray-300 print:pb-4">
          <p className="text-xs font-bold uppercase text-gray-600">{t('fleetReport.sampleBadge')}</p>
          <h1 className="text-2xl font-bold text-gray-900">{t('fleetReport.title')}</h1>
          <p className="text-sm text-gray-700">{summary.fleetName} · {summary.periodLabel}</p>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            {t('fleetReport.printPdf')}
          </Button>
          <Button variant="secondary" onClick={handleDownloadCsv}>
            <Download className="h-4 w-4" />
            {t('fleetReport.downloadCsv')}
          </Button>
          <Link
            to="/auth?redirect=/garage"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-700 active:bg-blue-50"
          >
            {t('fleetReport.startTracking')}
          </Link>
        </div>

        {/* Fleet snapshot */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm print:shadow-none">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" aria-hidden />
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('fleetReport.snapshotTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {summary.fleetName} · {summary.periodLabel}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-xs text-blue-800">{t('fleetReport.snapshotTrucks')}</p>
              <p className="text-2xl font-bold text-blue-900">{summary.truckCount}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-600">{t('fleetReport.snapshotDistance')}</p>
              <p className="text-lg font-bold text-gray-900 sm:text-xl">
                {summary.totalDistanceKm.toLocaleString()} {t('garage.km')}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-600">{t('fleetReport.snapshotLiters')}</p>
              <p className="text-lg font-bold text-gray-900 sm:text-xl">
                {summary.totalLiters.toLocaleString()} {t('garage.litersShort')}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-600">{t('fleetReport.snapshotCost')}</p>
              <p className="text-lg font-bold text-gray-900 sm:text-xl">
                {formatMmk(summary.totalCostMmk)} MMK
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 sm:col-span-2">
              <p className="text-xs text-blue-800">{t('fleetReport.snapshotFleetAvg')}</p>
              <p className="text-2xl font-bold text-blue-900">
                {summary.fleetAvgLPer100km.toFixed(1)} {t('garage.lPer100km')}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-medium text-green-800">{t('fleetReport.bestPerformer')}</p>
              <p className="mt-1 font-semibold text-green-900">
                {summary.bestTruck.label} — {summary.bestTruck.lPer100km.toFixed(1)} {t('garage.lPer100km')}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">{t('fleetReport.worstPerformer')}</p>
              <p className="mt-1 font-semibold text-amber-900">
                {summary.worstTruck.label} — {summary.worstTruck.lPer100km.toFixed(1)} {t('garage.lPer100km')}
              </p>
            </div>
          </div>
        </section>

        {/* Truck list */}
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Truck className="h-5 w-5 text-gray-700" aria-hidden />
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('fleetReport.truckListTitle')}</h2>
          </div>
          <p className="mb-4 text-base text-gray-700">{t('fleetReport.truckListBody')}</p>
          <ul className="space-y-3">
            {trucks.map((truck) => (
              <li key={truck.id}>
                <TruckCard truck={truck} />
              </li>
            ))}
          </ul>
        </section>

        {/* Like-for-like comparison */}
        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm print:shadow-none">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('fleetReport.likeForLikeTitle')}</h2>
          <p className="mt-2 text-base text-gray-700">{t('fleetReport.likeForLikeBody')}</p>
          <div className="mt-4 space-y-4">
            {likeForLike.map((group) => (
              <div key={group.groupId} className="rounded-xl border border-gray-100 bg-gray-50 p-4 print:break-inside-avoid">
                <h3 className="text-sm font-bold text-gray-900">
                  {t(`fleetReport.likeForLikeGroups.${group.groupId}.label`)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {group.trucks.map((truck) => (
                    <li
                      key={truck.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {truck.label} ({truck.driver})
                      </span>
                      <span className="font-semibold text-blue-900">
                        {truck.lPer100km.toFixed(1)} {t('garage.lPer100km')}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-gray-700">
                  {t(`fleetReport.likeForLikeGroups.${group.groupId}.insight`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Anonymous peer benchmark */}
        <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 print:break-inside-avoid">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-700" aria-hidden />
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('fleetReport.peerTitle')}</h2>
          </div>
          <p className="mt-2 text-base text-gray-700">{t('fleetReport.peerBody')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-3">
              <p className="text-xs text-gray-600">{t('fleetReport.yourFleetAvg')}</p>
              <p className="text-lg font-bold text-blue-900">
                {peerBenchmark.yourFleetAvg.toFixed(1)} {t('garage.lPer100km')}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="text-xs text-gray-600">{t('fleetReport.peerAvg')}</p>
              <p className="text-lg font-bold text-gray-900">
                {peerBenchmark.peerAvg.toFixed(1)} {t('garage.lPer100km')}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-700">
            {t('fleetReport.peerRange', {
              low: peerBenchmark.peerLow.toFixed(1),
              high: peerBenchmark.peerHigh.toFixed(1),
            })}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            {t('fleetReport.peerBasis', {
              vehicles: peerBenchmark.peerVehicles,
              owners: peerBenchmark.peerOwners,
            })}
          </p>
        </section>

        {/* Manufacturer / dealer insight preview */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm print:shadow-none">
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-gray-700" aria-hidden />
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('fleetReport.dealerTitle')}</h2>
          </div>
          <p className="mt-2 text-base text-gray-700">{t('fleetReport.dealerBody')}</p>
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-bold text-gray-900">{manufacturerInsight.modelLabel}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-600">{t('fleetReport.yourFleetAvg')}</p>
                <p className="font-bold text-blue-900">
                  {manufacturerInsight.yourFleetAvg.toFixed(1)} {t('garage.lPer100km')}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">{t('fleetReport.marketAvg')}</p>
                <p className="font-bold text-gray-900">
                  {manufacturerInsight.marketAvg.toFixed(1)} {t('garage.lPer100km')}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              {t('fleetReport.marketRange', {
                low: manufacturerInsight.marketLow.toFixed(1),
                high: manufacturerInsight.marketHigh.toFixed(1),
              })}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {t('fleetReport.marketBasis', {
                vehicles: manufacturerInsight.sampleVehicles,
                fleets: manufacturerInsight.sampleFleets,
              })}
            </p>
          </div>
        </section>

        {/* Privacy note */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5 print:break-inside-avoid">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-gray-600" aria-hidden />
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t('fleetReport.privacyTitle')}</h2>
              <p className="mt-2 text-base text-gray-700">{t('fleetReport.privacyBody')}</p>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mt-8 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 print:hidden">
          <h2 className="text-xl font-bold text-gray-900">{t('fleetReport.ctaTitle')}</h2>
          <p className="mt-2 text-base text-gray-700">{t('fleetReport.ctaBody')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/auth?redirect=/garage"
              className="inline-flex min-h-[44px] items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white active:bg-blue-700"
            >
              {t('fleetReport.startTracking')}
            </Link>
            <Link
              to="/garage"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-blue-300 bg-white px-5 text-sm font-semibold text-blue-700 active:bg-blue-50"
            >
              {t('garage.openTool')}
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
