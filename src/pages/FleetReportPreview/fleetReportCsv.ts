import type { DemoFleetReport, DemoFleetVehicle } from './demoFleetReportData'

function escapeCsv(value: string | number): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function vehicleRow(v: DemoFleetVehicle): string {
  return [
    v.label,
    v.vehicleType,
    v.manufacturer,
    v.model,
    v.year,
    v.driver,
    v.region,
    v.distanceKm,
    v.liters,
    v.costMmk,
    v.lPer100km.toFixed(1),
    v.status,
  ]
    .map(escapeCsv)
    .join(',')
}

export function buildFleetReportCsv(report: DemoFleetReport): string {
  const { summary, vehicles } = report
  const header = [
    'Vehicle',
    'Type',
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
    '# Fleet fuel report (sample)',
    `# Fleet: ${summary.fleetName}`,
    `# Period: ${summary.periodLabel}`,
    `# Vehicles: ${summary.vehicleCount}`,
    `# Total distance (km): ${summary.totalDistanceKm}`,
    `# Total liters: ${summary.totalLiters}`,
    `# Total cost (MMK): ${summary.totalCostMmk}`,
    `# Fleet average (L/100km): ${summary.fleetAvgLPer100km.toFixed(1)}`,
    '',
    header,
    ...vehicles.map(vehicleRow),
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
