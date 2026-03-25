import { create } from 'zustand'
import type { FuelCode, StatusFilter, StationFilters } from '@/types'

interface FilterState {
  filters: StationFilters
  setFuelTypes: (types: FuelCode[]) => void
  setStatusFilter: (status: StatusFilter) => void
  setMaxDistance: (km: number) => void
  setSelectedRouteId: (id: string | null) => void
  setVerifiedOnly: (on: boolean) => void
  resetFilters: () => void
}

const DEFAULT_FILTERS: StationFilters = {
  fuelTypes: [],
  statusFilter: 'ALL',
  maxDistanceKm: 5,
  selectedRouteId: null,
  verifiedOnly: false,
}

export const useFilterStore = create<FilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFuelTypes: (fuelTypes) =>
    set((s) => ({
      filters: {
        ...s.filters,
        fuelTypes: fuelTypes.length <= 1 ? fuelTypes : [fuelTypes[0]],
      },
    })),
  setStatusFilter: (statusFilter) => set((s) => ({ filters: { ...s.filters, statusFilter } })),
  setMaxDistance: (km) =>
    set((s) => ({ filters: { ...s.filters, maxDistanceKm: km, selectedRouteId: null } })),
  setSelectedRouteId: (selectedRouteId) => set((s) => ({ filters: { ...s.filters, selectedRouteId } })),
  setVerifiedOnly: (verifiedOnly) => set((s) => ({ filters: { ...s.filters, verifiedOnly } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}))
