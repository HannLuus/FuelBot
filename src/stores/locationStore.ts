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

type PersistedLocation = {
  lat: number
  lng: number
  ts: number
  source: 'gps' | 'ip'
}

const LAST_LOCATION_KEY = 'fuelbot:last_location'

function loadPersistedLocation(): PersistedLocation | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(LAST_LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedLocation
    if (
      !parsed ||
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      isNaN(parsed.lat) ||
      isNaN(parsed.lng) ||
      typeof parsed.ts !== 'number' ||
      (parsed.source !== 'gps' && parsed.source !== 'ip')
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function savePersistedLocation(loc: PersistedLocation) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc))
  } catch {
    // ignore
  }
}

export const useLocationStore = create<LocationState>((set) => ({
  lat: loadPersistedLocation()?.lat ?? null,
  lng: loadPersistedLocation()?.lng ?? null,
  error: null,
  loading: false,
  permissionChecked: false,
  usingIpFallback: loadPersistedLocation()?.source === 'ip',

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
      console.warn(`HTML5 Geolocation failed (${originalErrorMsg}). Using IP-based fallback...`)

      const fetchAndValidate = async (fetcher: () => Promise<{ lat: number; lng: number }>) => {
        const { lat, lng } = await fetcher()
        if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid coordinates')
        return { lat, lng }
      }

      // Race all providers simultaneously — first valid response wins.
      // This avoids the old sequential approach where 2–3 timeouts could mean 20–60s of waiting.
      try {
        const { lat, lng } = await Promise.any([
          fetchAndValidate(async () => {
            const res = await fetch('https://ipapi.co/json/')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          }),
          fetchAndValidate(async () => {
            const res = await fetch('https://ipinfo.io/json')
            const data = await res.json()
            const [la, lo] = data.loc.split(',')
            return { lat: parseFloat(la), lng: parseFloat(lo) }
          }),
          fetchAndValidate(async () => {
            const res = await fetch('https://ipwho.is/')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          }),
          fetchAndValidate(async () => {
            const res = await fetch('https://freeipapi.com/api/json')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          }),
          fetchAndValidate(async () => {
            const res = await fetch('https://get.geojs.io/v1/ip/geo.json')
            const data = await res.json()
            return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
          }),
        ])
        savePersistedLocation({ lat, lng, ts: Date.now(), source: 'ip' })
        set({ lat, lng, loading: false, error: null, usingIpFallback: true })
      } catch {
        // All providers failed — surface the original HTML5 error as it is more relevant
        set({ error: originalErrorMsg, loading: false })
      }
    }

    if (!navigator.geolocation) {
      set({ permissionChecked: true })
      void fetchIpLocationFallback('Geolocation not supported')
      return
    }

    const handleSuccess = (pos: GeolocationPosition) => {
      savePersistedLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        ts: Date.now(),
        source: 'gps',
      })
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
