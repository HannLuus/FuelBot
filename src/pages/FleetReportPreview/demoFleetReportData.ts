/** Sample truck row for the public fleet report preview (not live data). */

export type FleetTruckStatus = 'better' | 'average' | 'worse'

export interface DemoFleetTruck {
  id: string
  label: string
  manufacturer: string
  model: string
  year: number
  driver: string
  region: string
  distanceKm: number
  liters: number
  costMmk: number
  lPer100km: number
  status: FleetTruckStatus
}

export interface DemoFleetSummary {
  fleetName: string
  periodLabel: string
  truckCount: number
  totalDistanceKm: number
  totalLiters: number
  totalCostMmk: number
  fleetAvgLPer100km: number
  bestTruck: DemoFleetTruck
  worstTruck: DemoFleetTruck
}

export interface DemoLikeForLikeGroup {
  groupId: 'hino500' | 'fusoFighter' | 'hino700'
  trucks: DemoFleetTruck[]
}

export interface DemoPeerBenchmark {
  yourFleetAvg: number
  peerAvg: number
  peerLow: number
  peerHigh: number
  peerVehicles: number
  peerOwners: number
}

export interface DemoManufacturerInsight {
  modelLabel: string
  yourFleetAvg: number
  marketAvg: number
  marketLow: number
  marketHigh: number
  sampleVehicles: number
  sampleFleets: number
}

export interface DemoFleetReport {
  summary: DemoFleetSummary
  trucks: DemoFleetTruck[]
  likeForLike: DemoLikeForLikeGroup[]
  peerBenchmark: DemoPeerBenchmark
  manufacturerInsight: DemoManufacturerInsight
}

const DIESEL_PRICE_MMK = 2850

const RAW_TRUCKS: Omit<DemoFleetTruck, 'status'>[] = [
  {
    id: 't1',
    label: 'Truck #1',
    manufacturer: 'Hino',
    model: '500 Series',
    year: 2019,
    driver: 'U Kyaw',
    region: 'Yangon–Mandalay',
    distanceKm: 8420,
    liters: 2526,
    costMmk: 2526 * DIESEL_PRICE_MMK,
    lPer100km: 30.0,
  },
  {
    id: 't2',
    label: 'Truck #2',
    manufacturer: 'Hino',
    model: '500 Series',
    year: 2020,
    driver: 'U Min',
    region: 'Yangon–Mandalay',
    distanceKm: 8100,
    liters: 2268,
    costMmk: 2268 * DIESEL_PRICE_MMK,
    lPer100km: 28.0,
  },
  {
    id: 't3',
    label: 'Truck #3',
    manufacturer: 'Hino',
    model: '500 Series',
    year: 2018,
    driver: 'U Htun',
    region: 'Yangon–Mandalay',
    distanceKm: 7950,
    liters: 2544,
    costMmk: 2544 * DIESEL_PRICE_MMK,
    lPer100km: 32.0,
  },
  {
    id: 't4',
    label: 'Truck #4',
    manufacturer: 'Fuso',
    model: 'Fighter',
    year: 2021,
    driver: 'U Zaw',
    region: 'Mandalay–Lashio',
    distanceKm: 6200,
    liters: 1736,
    costMmk: 1736 * DIESEL_PRICE_MMK,
    lPer100km: 28.0,
  },
  {
    id: 't5',
    label: 'Truck #5',
    manufacturer: 'Fuso',
    model: 'Fighter',
    year: 2019,
    driver: 'U Aung',
    region: 'Mandalay–Lashio',
    distanceKm: 5980,
    liters: 1854,
    costMmk: 1854 * DIESEL_PRICE_MMK,
    lPer100km: 31.0,
  },
  {
    id: 't6',
    label: 'Truck #6',
    manufacturer: 'Isuzu',
    model: 'FVR',
    year: 2020,
    driver: 'U Soe',
    region: 'Yangon local',
    distanceKm: 4100,
    liters: 1148,
    costMmk: 1148 * DIESEL_PRICE_MMK,
    lPer100km: 28.0,
  },
  {
    id: 't7',
    label: 'Truck #7',
    manufacturer: 'Isuzu',
    model: 'FVR',
    year: 2017,
    driver: 'U Win',
    region: 'Yangon local',
    distanceKm: 4350,
    liters: 1305,
    costMmk: 1305 * DIESEL_PRICE_MMK,
    lPer100km: 30.0,
  },
  {
    id: 't8',
    label: 'Truck #8',
    manufacturer: 'Hino',
    model: '700 Series',
    year: 2022,
    driver: 'U Myo',
    region: 'Yangon–Naypyidaw',
    distanceKm: 7200,
    liters: 2592,
    costMmk: 2592 * DIESEL_PRICE_MMK,
    lPer100km: 36.0,
  },
  {
    id: 't9',
    label: 'Truck #9',
    manufacturer: 'Hino',
    model: '700 Series',
    year: 2021,
    driver: 'U Naing',
    region: 'Yangon–Naypyidaw',
    distanceKm: 7050,
    liters: 2468,
    costMmk: 2468 * DIESEL_PRICE_MMK,
    lPer100km: 35.0,
  },
  {
    id: 't10',
    label: 'Truck #10',
    manufacturer: 'Fuso',
    model: 'Super Great',
    year: 2020,
    driver: 'U Tun',
    region: 'Yangon–Mandalay',
    distanceKm: 8800,
    liters: 3344,
    costMmk: 3344 * DIESEL_PRICE_MMK,
    lPer100km: 38.0,
  },
]

function classifyStatus(lPer100km: number, fleetAvg: number): FleetTruckStatus {
  if (lPer100km < fleetAvg * 0.97) return 'better'
  if (lPer100km > fleetAvg * 1.03) return 'worse'
  return 'average'
}

function buildTrucksWithStatus(fleetAvg: number): DemoFleetTruck[] {
  return RAW_TRUCKS.map((t) => ({
    ...t,
    status: classifyStatus(t.lPer100km, fleetAvg),
  }))
}

function buildSummary(trucks: DemoFleetTruck[]): DemoFleetSummary {
  const totalDistanceKm = trucks.reduce((s, t) => s + t.distanceKm, 0)
  const totalLiters = trucks.reduce((s, t) => s + t.liters, 0)
  const totalCostMmk = trucks.reduce((s, t) => s + t.costMmk, 0)
  const fleetAvgLPer100km = totalDistanceKm > 0 ? (totalLiters / totalDistanceKm) * 100 : 0

  const sorted = [...trucks].sort((a, b) => a.lPer100km - b.lPer100km)
  const bestTruck = sorted[0] ?? trucks[0]
  const worstTruck = sorted[sorted.length - 1] ?? trucks[0]

  return {
    fleetName: 'Golden Route Transport Co.',
    periodLabel: 'Jan–Mar 2026',
    truckCount: trucks.length,
    totalDistanceKm,
    totalLiters,
    totalCostMmk,
    fleetAvgLPer100km,
    bestTruck,
    worstTruck,
  }
}

function buildLikeForLike(trucks: DemoFleetTruck[]): DemoLikeForLikeGroup[] {
  const hino500 = trucks.filter((t) => t.manufacturer === 'Hino' && t.model === '500 Series')
  const fusoFighter = trucks.filter((t) => t.manufacturer === 'Fuso' && t.model === 'Fighter')
  const hino700 = trucks.filter((t) => t.manufacturer === 'Hino' && t.model === '700 Series')

  return [
    { groupId: 'hino500' as const, trucks: hino500 },
    { groupId: 'fusoFighter' as const, trucks: fusoFighter },
    { groupId: 'hino700' as const, trucks: hino700 },
  ]
}

export function getDemoFleetReport(): DemoFleetReport {
  const prelimAvg =
    RAW_TRUCKS.reduce((s, t) => s + t.lPer100km, 0) / RAW_TRUCKS.length
  const trucks = buildTrucksWithStatus(prelimAvg)
  const summary = buildSummary(trucks)

  return {
    summary,
    trucks,
    likeForLike: buildLikeForLike(trucks),
    peerBenchmark: {
      yourFleetAvg: summary.fleetAvgLPer100km,
      peerAvg: 31.2,
      peerLow: 28.5,
      peerHigh: 34.8,
      peerVehicles: 47,
      peerOwners: 12,
    },
    manufacturerInsight: {
      modelLabel: 'Fuso Fighter (6–8 ton, diesel)',
      yourFleetAvg: 29.5,
      marketAvg: 30.8,
      marketLow: 27.2,
      marketHigh: 33.5,
      sampleVehicles: 86,
      sampleFleets: 19,
    },
  }
}
