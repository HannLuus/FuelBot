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
  /** True when location was obtained from an IP geolocation fallback (not GPS). */
  usingIpFallback: boolean
  requestLocation: (options?: { highAccuracy?: boolean }) => void
  /** Check permission without requesting. Resolves to null if Permissions API not available. */
  checkPermission: (options?: { onGranted?: () => void }) => Promise<GeolocationPermissionState>
  clearError: () => void
}

export const useLocationStore = create<LocationState>((set) => ({
  lat: null,
  lng: null,
  error: null,
  loading: false,
  permissionChecked: false,
  usingIpFallback: false,

  clearError: () => set({ error: null }),

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
        
        const fetchers = [
          async () => {
            const res = await fetch('https://ipapi.co/json/')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          },
          async () => {
            const res = await fetch('https://ipinfo.io/json')
            const data = await res.json()
            const [lat, lng] = data.loc.split(',')
            return { lat: parseFloat(lat), lng: parseFloat(lng) }
          },
          async () => {
            const res = await fetch('https://ipwho.is/')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          },
          async () => {
            const res = await fetch('https://freeipapi.com/api/json')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          },
          async () => {
            const res = await fetch('https://get.geojs.io/v1/ip/geo.json')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          }
        ]

        let success = false
        for (const fetcher of fetchers) {
          try {
            const { lat, lng } = await fetcher()
            if (!isNaN(lat) && !isNaN(lng)) {
              set({ lat, lng, loading: false, error: null, usingIpFallback: true })
              success = true
              break
            }
          } catch (e) {
            console.warn('IP fallback provider failed, trying next...')
          }
        }

        if (!success) {
          throw new Error('All IP location providers failed')
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
        usingIpFallback: false,
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
              timeout: 15000, // Give low accuracy a fair chance
              maximumAge: 60000,
            },
          )
        } else {
          void fetchIpLocationFallback(getErrorMessage(err))
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: 20000, // Give native GPS plenty of time to lock on before giving up
        maximumAge: highAccuracy ? 0 : 60000,
      },
    )
  },
}))
