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
    set({ loading: true, error: null })
    const highAccuracy = options?.highAccuracy ?? false

    const fetchIpLocationFallback = async (originalErrorMsg: string) => {
      try {
        console.warn(`HTML5 Geolocation failed (${originalErrorMsg}). Using IP-based fallback...`)
        const response = await fetch('https://get.geojs.io/v1/ip/geo.json')
        if (!response.ok) throw new Error('IP Geolocation failed')
        const data = await response.json()

        if (data.latitude && data.longitude) {
          set({
            lat: parseFloat(data.latitude),
            lng: parseFloat(data.longitude),
            loading: false,
            error: null,
          })
        } else {
          throw new Error('Invalid IP location data')
        }
      } catch (err) {
        // If IP fallback also fails, return the original HTML5 error as it is more relevant
        set({
          error: originalErrorMsg,
          loading: false,
        })
      }
    }

    if (!navigator.geolocation) {
      set({ permissionChecked: true })
      void fetchIpLocationFallback('Geolocation not supported')
      return
    }

    const handleSuccess = (pos: GeolocationPosition) => {
      set({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        loading: false,
        error: null,
      })
    }

    const getErrorMessage = (err: GeolocationPositionError) => {
      return err.code === 1
        ? 'PERMISSION_DENIED'
        : err.code === 2
          ? 'POSITION_UNAVAILABLE'
          : err.code === 3
            ? 'TIMEOUT'
            : err.message
    }

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => {
        if (highAccuracy && (err.code === 2 || err.code === 3)) {
          console.warn('High accuracy geolocation failed, falling back to low accuracy...')
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            (fallbackErr) => {
              void fetchIpLocationFallback(getErrorMessage(fallbackErr))
            },
            {
              enableHighAccuracy: false,
              timeout: 10000, // Reduced timeout so IP fallback triggers faster
              maximumAge: 60000,
            },
          )
        } else {
          void fetchIpLocationFallback(getErrorMessage(err))
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: 10000, // Shorter timeout for the first attempt to fail fast and fallback
        maximumAge: highAccuracy ? 0 : 60000,
      },
    )
  },
}))
