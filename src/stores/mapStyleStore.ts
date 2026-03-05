import { create } from 'zustand'

const STORAGE_KEY = 'fuelbot-map-style'

export type MapStyle = 'light' | 'dark'

function getStored(): MapStyle {
  if (typeof window === 'undefined') return 'light'
  const s = window.localStorage.getItem(STORAGE_KEY)
  if (s === 'dark' || s === 'light') return s
  return 'light'
}

interface MapStyleState {
  mapStyle: MapStyle
  setMapStyle: (style: MapStyle) => void
}

export const useMapStyleStore = create<MapStyleState>((set) => ({
  mapStyle: getStored(),
  setMapStyle: (mapStyle) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, mapStyle)
    set({ mapStyle })
  },
}))
