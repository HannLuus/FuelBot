/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DEVICE_HASH_SALT?: string
  readonly VITE_PAYMENT_INSTRUCTIONS?: string
  readonly VITE_PAYMENT_QR_URL?: string
  readonly VITE_PAYMENT_PHONE_WAVEPAY?: string
  readonly VITE_PAYMENT_PHONE_KPAY?: string
  readonly VITE_ADMIN_NOTIFICATION_EMAIL?: string
  readonly VITE_STATION_SUBSCRIPTION_ANNUAL_MMK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {
  const content: string
  export default content
}

/** PWA install prompt (Chrome/Edge/Android); not fired on iOS Safari */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
