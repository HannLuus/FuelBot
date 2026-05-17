/** API hostname from VITE_SUPABASE_URL (cloud or self-hosted). */
export function getSupabaseApiHostname(): string | null {
  const raw = import.meta.env.VITE_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}
