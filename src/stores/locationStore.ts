import { create } from 'zustand'

/** Permission state from Permissions API (if available). */
export type GeolocationPermissionState = 'granted' | 'prompt' | 'denied' | null

interface LocationState {
  lat: number | null
  lng: number | null
  error: string | null
  loading: boolean
  /** Only set after we've checked (or attempted) permission. */
  permissionChecked: boolean
  requestLocation: (options?: { highAccuracy?: boolean }) => void
  /** Check permission without requesting. Resolves to null if Permissions API not available. */
  checkPermission: (options?: { onGranted?: () => void }) => Promise<GeolocationPermissionState>
}

export const useLocationStore = create<LocationState>((set) => ({
  lat: null,
  lng: null,
  error: null,
  loading: false,
  permissionChecked: false,

  checkPermission: (options?: { onGranted?: () => void }): Promise<GeolocationPermissionState> => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      set({ permissionChecked: true })
      return Promise.resolve(null)
    }
    return navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        const state = result.state as GeolocationPermissionState
        if (state === 'granted' && options?.onGranted) {
          options.onGranted()
        }
        set({ permissionChecked: true })
        return state
      })
      .catch(() => {
        set({ permissionChecked: true })
        return null
      })
  },

  requestLocation: (options?: { highAccuracy?: boolean }) => {
    if (!navigator.geolocation) {
      set({ error: 'Geolocation not supported', loading: false, permissionChecked: true })
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
