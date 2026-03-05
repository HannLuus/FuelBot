import { create } from 'zustand'
import type { FuelCode, StatusFilter, StationFilters } from '@/types'

interface FilterState {
  filters: StationFilters
  setFuelTypes: (types: FuelCode[]) => void
  setStatusFilter: (status: StatusFilter) => void
  setMaxDistance: (km: number) => void
  resetFilters: () => void
}

const DEFAULT_FILTERS: StationFilters = {
  fuelTypes: [],
  statusFilter: 'ALL',
  maxDistanceKm: 5,
}

export const useFilterStore = create<FilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFuelTypes: (fuelTypes) => set((s) => ({ filters: { ...s.filters, fuelTypes } })),
  setStatusFilter: (statusFilter) => set((s) => ({ filters: { ...s.filters, statusFilter } })),
  setMaxDistance: (km) => set((s) => ({ filters: { ...s.filters, maxDistanceKm: km } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}))
