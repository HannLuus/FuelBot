import { create } from 'zustand'

interface LocationState {
  lat: number | null
  lng: number | null
  error: string | null
  loading: boolean
  requestLocation: () => void
}

export const useLocationStore = create<LocationState>((set) => ({
  lat: null,
  lng: null,
  error: null,
  loading: false,

  requestLocation: () => {
    if (!navigator.geolocation) {
      set({ error: 'Geolocation not supported', loading: false })
      return
    }
    set({ loading: true, error: null })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          loading: false,
          error: null,
        })
      },
      (err) => {
        set({ error: err.message, loading: false })
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  },
}))
