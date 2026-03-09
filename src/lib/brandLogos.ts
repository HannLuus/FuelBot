/**
 * Brand code to logo URL for map tooltips and station UI.
 * Add logos under public/brands/ (e.g. mpe.png, shwe-taung.png) and reference here.
 */
const BRAND_LOGO_PATHS: Record<string, string> = {
  MPE: '/brands/mpe.png',
  'Shwe Taung': '/brands/shwe-taung.png',
  Total: '/brands/total.png',
  PTT: '/brands/ptt.png',
  CNPC: '/brands/cnpc.png',
}

/** Normalize brand string for lookup (trim, title case or uppercase as stored) */
export function getBrandLogoUrl(brand: string | null | undefined): string | null {
  if (brand == null || !String(brand).trim()) return null
  const key = String(brand).trim()
  return BRAND_LOGO_PATHS[key] ?? BRAND_LOGO_PATHS[key.toUpperCase()] ?? null
}

/** First letter of brand for fallback when no logo (e.g. "M" for MPE) */
export function getBrandInitial(brand: string | null | undefined): string {
  if (brand == null || !String(brand).trim()) return '?'
  return String(brand).trim().charAt(0).toUpperCase()
}
