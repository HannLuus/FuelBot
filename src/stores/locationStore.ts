import { create } from 'zustand'

interface LocationState {
  lat: number | null
  lng: number | null
  error: string | null
  loading: boolean
  requestLocation: (options?: { highAccuracy?: boolean }) => void
}

export const useLocationStore = create<LocationState>((set) => ({
  lat: null,
  lng: null,
  error: null,
  loading: false,

  requestLocation: (options?: { highAccuracy?: boolean }) => {
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
      {
        enableHighAccuracy: options?.highAccuracy ?? false,
        timeout: 15000,
        maximumAge: options?.highAccuracy ? 0 : 60000,
      },
    )
  },
}))
