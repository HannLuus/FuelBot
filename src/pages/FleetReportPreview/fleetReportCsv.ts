import type { DemoFleetReport, DemoFleetTruck } from './demoFleetReportData'

function escapeCsv(value: string | number): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function truckRow(t: DemoFleetTruck): string {
  return [
    t.label,
    t.manufacturer,
    t.model,
    t.year,
    t.driver,
    t.region,
    t.distanceKm,
    t.liters,
    t.costMmk,
    t.lPer100km.toFixed(1),
    t.status,
  ]
    .map(escapeCsv)
    .join(',')
}

export function buildFleetReportCsv(report: DemoFleetReport): string {
  const { summary, trucks } = report
  const header = [
    'Truck',
    'Manufacturer',
    'Model',
    'Year',
    'Driver',
    'Region',
    'Distance (km)',
    'Liters',
    'Cost (MMK)',
    'L/100km',
    'vs fleet avg',
  ].join(',')

  const meta = [
    `# Fleet fuel report (sample)`,
    `# Fleet: ${summary.fleetName}`,
    `# Period: ${summary.periodLabel}`,
    `# Trucks: ${summary.truckCount}`,
    `# Total distance (km): ${summary.totalDistanceKm}`,
    `# Total liters: ${summary.totalLiters}`,
    `# Total cost (MMK): ${summary.totalCostMmk}`,
    `# Fleet average (L/100km): ${summary.fleetAvgLPer100km.toFixed(1)}`,
    '',
    header,
    ...trucks.map(truckRow),
  ]

  return meta.join('\n')
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
