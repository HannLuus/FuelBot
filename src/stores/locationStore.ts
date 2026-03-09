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
    const highAccuracy = options?.highAccuracy ?? false
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
        const message =
          err.code === 1
            ? 'PERMISSION_DENIED'
            : err.code === 2
              ? 'POSITION_UNAVAILABLE'
              : err.code === 3
                ? 'TIMEOUT'
                : err.message
        set({ error: message, loading: false })
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: 20000,
        maximumAge: highAccuracy ? 0 : 60000,
      },
    )
  },
}))
