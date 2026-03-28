import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush(): Promise<'subscribed' | 'already_subscribed' | 'denied' | 'unsupported' | 'error'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (!VAPID_PUBLIC_KEY) {
    console.error('[FuelBot] VITE_VAPID_PUBLIC_KEY is not set. Push subscriptions will not work.')
    return 'error'
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (userError || !userId) {
    console.error('[FuelBot] Cannot subscribe to push without an authenticated user.')
    return 'error'
  }

  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch (err) {
    console.error('[FuelBot] Notification permission request failed:', err)
    return 'error'
  }
  if (permission !== 'granted') return 'denied'

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      // Ensure DB row exists for this device even if the browser already has a subscription.
      const json = existing.toJSON()
      const keys = json.keys as { p256dh: string; auth: string } | undefined
      if (!keys?.p256dh || !keys?.auth) {
        console.error('[FuelBot] Existing push subscription is missing keys.')
        return 'error'
      }
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: existing.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: 'user_id,endpoint' },
      )
      if (error) {
        console.error('[FuelBot] Failed to save existing push subscription:', {
          message: error.message,
          code: error.code,
          details: error.details,
        })
        return 'error'
      }
      return 'already_subscribed'
    }

    let applicationServerKey: ArrayBuffer
    try {
      applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer
    } catch (err) {
      console.error('[FuelBot] Invalid VITE_VAPID_PUBLIC_KEY:', err)
      return 'error'
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })

    const json = subscription.toJSON()
    const keys = json.keys as { p256dh: string; auth: string } | undefined
    if (!keys?.p256dh || !keys?.auth) {
      console.error('[FuelBot] Push subscription is missing keys.')
      return 'error'
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }, { onConflict: 'user_id,endpoint' })

    if (error) {
      console.error('[FuelBot] Failed to save push subscription:', {
        message: error.message,
        code: error.code,
        details: error.details,
      })
      return 'error'
    }
    return 'subscribed'
  } catch (err) {
    console.error('[FuelBot] Push subscription error:', err)
    return 'error'
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint)
      await subscription.unsubscribe()
    }
  } catch (err) {
    console.error('[FuelBot] Push unsubscribe error:', err)
  }
}
