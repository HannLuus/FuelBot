/**
 * From address for Resend emails. Use verified domain admin@fuelbotmm.com.
 * Override with RESEND_FROM_EMAIL in Edge Function secrets if needed.
 */
export const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'FuelBot <admin@fuelbotmm.com>'
const DEFAULT_APP_BASE_URL = 'https://fuelbotmm.com'

/**
 * Canonical public app origin used in outbound links and email assets.
 * Always defaults to production domain instead of *.vercel.app.
 */
export function getAppBaseUrl(): string {
  const raw = Deno.env.get('APP_URL')?.trim()
  if (!raw) return DEFAULT_APP_BASE_URL
  try {
    // Canonicalize to origin only; ignore accidental path/query in APP_URL.
    return new URL(raw).origin
  } catch {
    console.warn('Invalid APP_URL, falling back to default domain')
    return DEFAULT_APP_BASE_URL
  }
}

/** Admin panel URL helper. */
export function getAppAdminUrl(): string {
  return `${getAppBaseUrl()}/admin`
}

/**
 * Returns HTML fragment for FuelBot logo to prepend to outbound emails.
 * @param appBaseUrl - Full app URL (e.g. https://fuelbotmm.com or .../admin); origin is used for the logo image.
 */
export function emailLogoHtml(appBaseUrl: string): string {
  let origin = DEFAULT_APP_BASE_URL
  try {
    origin = new URL(appBaseUrl).origin
  } catch {
    // Keep emails working even if URL input is malformed.
    origin = DEFAULT_APP_BASE_URL
  }
  return `<div style="margin-bottom:16px"><img src="${origin}/FuelbotLogo.png" alt="FuelBot" width="120" style="display:block;height:auto" /></div>`
}
