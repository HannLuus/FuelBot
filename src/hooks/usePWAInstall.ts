import { useEffect, useState, useCallback, useRef } from 'react'

/** Detect iOS (Safari); beforeinstallprompt is not fired there. */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Already running as installed PWA. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export interface UsePWAInstallResult {
  /** True when the browser has fired beforeinstallprompt (Chrome/Edge/Android). */
  canInstall: boolean
  /** True on iOS; use to show "Add to Home Screen" instructions instead of native prompt. */
  isIOS: boolean
  /** True when the app is already running as an installed PWA. */
  isStandalone: boolean
  /** Call to show the native install prompt. No-op if canInstall is false. */
  prompt: () => Promise<boolean>
  /** Whether the install UI should be shown (can install, or iOS and not standalone). */
  showInstallUI: boolean
  /** True while the native install prompt is being shown (avoid double-tap). */
  isPrompting: boolean
}

export function usePWAInstall(): UsePWAInstallResult {
  const [canInstall, setCanInstall] = useState(false)
  const [isPrompting, setIsPrompting] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  const isIOSDevice = isIOS()
  const isStandaloneMode = isStandalone()

  const showInstallUI = (canInstall || isIOSDevice) && !isStandaloneMode

  const prompt = useCallback(async (): Promise<boolean> => {
    const ev = deferredRef.current
    if (!ev) return false
    setIsPrompting(true)
    try {
      await ev.prompt()
      const { outcome } = await ev.userChoice
      if (outcome === 'accepted') {
        setCanInstall(false)
        deferredRef.current = null
        return true
      }
    } catch {
      // Ignore
    } finally {
      setIsPrompting(false)
    }
    return false
  }, [])

  useEffect(() => {
    let mounted = true

    function handleBeforeInstallPrompt(e: Event): void {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      if (mounted) setCanInstall(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => {
      mounted = false
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  return { canInstall, isIOS: isIOSDevice, isStandalone: isStandaloneMode, prompt, showInstallUI, isPrompting }
}
