/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DEVICE_HASH_SALT?: string
  readonly VITE_PAYMENT_INSTRUCTIONS?: string
  readonly VITE_PAYMENT_QR_URL?: string
  readonly VITE_ADMIN_NOTIFICATION_EMAIL?: string
  readonly VITE_TIER_PRICE_SMALL_MMK?: string
  readonly VITE_TIER_PRICE_MEDIUM_MMK?: string
  readonly VITE_TIER_PRICE_LARGE_MMK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {
  const content: string
  export default content
}
