/** Sample vehicle rows for the public fleet report preview (not live data). */

export type FleetVehicleStatus = 'better' | 'average' | 'worse'

export interface DemoFleetVehicle {
  id: string
  label: string
  vehicleType: string
  manufacturer: string
  model: string
  year: number
  driver: string
  region: string
  distanceKm: number
  liters: number
  costMmk: number
  lPer100km: number
  status: FleetVehicleStatus
}

export interface DemoFleetSummary {
  fleetName: string
  periodLabel: string
  vehicleCount: number
  totalDistanceKm: number
  totalLiters: number
  totalCostMmk: number
  fleetAvgLPer100km: number
  bestVehicle: DemoFleetVehicle
  worstVehicle: DemoFleetVehicle
}

export interface DemoLikeForLikeGroup {
  groupId: 'salesCars' | 'deliveryMotorcycles' | 'serviceVehicles'
  vehicles: DemoFleetVehicle[]
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
  vehicles: DemoFleetVehicle[]
  likeForLike: DemoLikeForLikeGroup[]
  peerBenchmark: DemoPeerBenchmark
  manufacturerInsight: DemoManufacturerInsight
}

const FUEL_PRICE_MMK = 2850

const RAW_VEHICLES: Omit<DemoFleetVehicle, 'status'>[] = [
  {
    id: 'v1',
    label: 'Sales Car #1',
    vehicleType: 'Car',
    manufacturer: 'Toyota',
    model: 'Probox',
    year: 2019,
    driver: 'U Kyaw',
    region: 'Yangon customer visits',
    distanceKm: 3560,
    liters: 320,
    costMmk: 320 * FUEL_PRICE_MMK,
    lPer100km: 9.0,
  },
  {
    id: 'v2',
    label: 'Sales Car #2',
    vehicleType: 'Car',
    manufacturer: 'Toyota',
    model: 'Probox',
    year: 2020,
    driver: 'Daw May',
    region: 'Yangon customer visits',
    distanceKm: 3420,
    liters: 376,
    costMmk: 376 * FUEL_PRICE_MMK,
    lPer100km: 11.0,
  },
  {
    id: 'v3',
    label: 'Delivery Bike #1',
    vehicleType: 'Motorcycle',
    manufacturer: 'Honda',
    model: 'Wave 110',
    year: 2021,
    driver: 'Ko Lin',
    region: 'Downtown deliveries',
    distanceKm: 2120,
    liters: 53,
    costMmk: 53 * FUEL_PRICE_MMK,
    lPer100km: 2.5,
  },
  {
    id: 'v4',
    label: 'Delivery Bike #2',
    vehicleType: 'Motorcycle',
    manufacturer: 'Honda',
    model: 'Wave 110',
    year: 2022,
    driver: 'Ko Htet',
    region: 'Downtown deliveries',
    distanceKm: 2050,
    liters: 68,
    costMmk: 68 * FUEL_PRICE_MMK,
    lPer100km: 3.3,
  },
  {
    id: 'v5',
    label: 'Service Van #1',
    vehicleType: 'Van',
    manufacturer: 'Toyota',
    model: 'Hiace',
    year: 2018,
    driver: 'U Aung',
    region: 'Yangon–Bago repairs',
    distanceKm: 4980,
    liters: 568,
    costMmk: 568 * FUEL_PRICE_MMK,
    lPer100km: 11.4,
  },
  {
    id: 'v6',
    label: 'Service Van #2',
    vehicleType: 'Van',
    manufacturer: 'Nissan',
    model: 'NV350',
    year: 2019,
    driver: 'U Soe',
    region: 'Yangon–Bago repairs',
    distanceKm: 4620,
    liters: 610,
    costMmk: 610 * FUEL_PRICE_MMK,
    lPer100km: 13.2,
  },
  {
    id: 'v7',
    label: 'Pickup #1',
    vehicleType: 'Pickup',
    manufacturer: 'Toyota',
    model: 'Hilux',
    year: 2020,
    driver: 'U Win',
    region: 'Warehouse deliveries',
    distanceKm: 5300,
    liters: 742,
    costMmk: 742 * FUEL_PRICE_MMK,
    lPer100km: 14.0,
  },
  {
    id: 'v8',
    label: 'Minibus #1',
    vehicleType: 'Bus',
    manufacturer: 'Toyota',
    model: 'Coaster',
    year: 2017,
    driver: 'U Naing',
    region: 'Staff transport',
    distanceKm: 6100,
    liters: 1037,
    costMmk: 1037 * FUEL_PRICE_MMK,
    lPer100km: 17.0,
  },
  {
    id: 'v9',
    label: 'Cargo Truck #1',
    vehicleType: 'Truck',
    manufacturer: 'Isuzu',
    model: 'NPR',
    year: 2020,
    driver: 'U Myo',
    region: 'Yangon–Mandalay freight',
    distanceKm: 7800,
    liters: 1872,
    costMmk: 1872 * FUEL_PRICE_MMK,
    lPer100km: 24.0,
  },
  {
    id: 'v10',
    label: 'Office Car #1',
    vehicleType: 'Car',
    manufacturer: 'Suzuki',
    model: 'Ertiga',
    year: 2021,
    driver: 'Daw Hnin',
    region: 'Admin errands',
    distanceKm: 2850,
    liters: 271,
    costMmk: 271 * FUEL_PRICE_MMK,
    lPer100km: 9.5,
  },
]

function classifyStatus(lPer100km: number, fleetAvg: number): FleetVehicleStatus {
  if (lPer100km < fleetAvg * 0.9) return 'better'
  if (lPer100km > fleetAvg * 1.1) return 'worse'
  return 'average'
}

function buildVehiclesWithStatus(fleetAvg: number): DemoFleetVehicle[] {
  return RAW_VEHICLES.map((v) => ({
    ...v,
    status: classifyStatus(v.lPer100km, fleetAvg),
  }))
}

function buildSummary(vehicles: DemoFleetVehicle[]): DemoFleetSummary {
  const totalDistanceKm = vehicles.reduce((s, v) => s + v.distanceKm, 0)
  const totalLiters = vehicles.reduce((s, v) => s + v.liters, 0)
  const totalCostMmk = vehicles.reduce((s, v) => s + v.costMmk, 0)
  const fleetAvgLPer100km = totalDistanceKm > 0 ? (totalLiters / totalDistanceKm) * 100 : 0

  const sorted = [...vehicles].sort((a, b) => a.lPer100km - b.lPer100km)
  const bestVehicle = sorted[0] ?? vehicles[0]
  const worstVehicle = sorted[sorted.length - 1] ?? vehicles[0]

  return {
    fleetName: 'Myanmar Field Services Co.',
    periodLabel: 'Jan-Mar 2026',
    vehicleCount: vehicles.length,
    totalDistanceKm,
    totalLiters,
    totalCostMmk,
    fleetAvgLPer100km,
    bestVehicle,
    worstVehicle,
  }
}

function buildLikeForLike(vehicles: DemoFleetVehicle[]): DemoLikeForLikeGroup[] {
  const salesCars = vehicles.filter((v) => v.model === 'Probox')
  const deliveryMotorcycles = vehicles.filter((v) => v.model === 'Wave 110')
  const serviceVehicles = vehicles.filter((v) => v.label.startsWith('Service Van'))

  return [
    { groupId: 'salesCars' as const, vehicles: salesCars },
    { groupId: 'deliveryMotorcycles' as const, vehicles: deliveryMotorcycles },
    { groupId: 'serviceVehicles' as const, vehicles: serviceVehicles },
  ]
}

export function getDemoFleetReport(): DemoFleetReport {
  const totalDistanceKm = RAW_VEHICLES.reduce((s, v) => s + v.distanceKm, 0)
  const totalLiters = RAW_VEHICLES.reduce((s, v) => s + v.liters, 0)
  const fleetAvgForStatus =
    totalDistanceKm > 0 ? (totalLiters / totalDistanceKm) * 100 : 0
  const vehicles = buildVehiclesWithStatus(fleetAvgForStatus)
  const summary = buildSummary(vehicles)

  return {
    summary,
    vehicles,
    likeForLike: buildLikeForLike(vehicles),
    peerBenchmark: {
      yourFleetAvg: summary.fleetAvgLPer100km,
      peerAvg: 12.8,
      peerLow: 8.9,
      peerHigh: 17.6,
      peerVehicles: 138,
      peerOwners: 31,
    },
    manufacturerInsight: {
      modelLabel: 'Toyota Probox (sales and service fleets)',
      yourFleetAvg: 10.0,
      marketAvg: 10.7,
      marketLow: 8.6,
      marketHigh: 12.4,
      sampleVehicles: 74,
      sampleFleets: 18,
    },
  }
}
