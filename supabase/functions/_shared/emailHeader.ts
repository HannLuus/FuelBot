/**
 * From address for Resend emails. Use verified domain admin@fuelbotmm.com.
 * Override with RESEND_FROM_EMAIL in Edge Function secrets if needed.
 */
export const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'FuelBot <admin@fuelbotmm.com>'

/**
 * Returns HTML fragment for FuelBot logo to prepend to outbound emails.
 * @param appBaseUrl - Full app URL (e.g. https://fuelbot.vercel.app or .../admin); origin is used for the logo image.
 */
export function emailLogoHtml(appBaseUrl: string): string {
  const origin = new URL(appBaseUrl).origin
  return `<div style="margin-bottom:16px"><img src="${origin}/FuelbotLogo.png" alt="FuelBot" width="120" style="display:block;height:auto" /></div>`
}
