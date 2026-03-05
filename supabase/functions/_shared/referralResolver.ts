import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ResolvedReferral {
  user_id: string
  code: string
}

/**
 * Normalize code for comparison: uppercase, trim, ensure FB- prefix for lookup.
 */
function normalizeCode(raw: string): string {
  const t = raw.trim().toUpperCase()
  if (t.startsWith('FB-')) return t
  return `FB-${t}`
}

/**
 * Best-match referral code resolution: exact → normalized → fuzzy (code contains or equals).
 * Returns the referrer user_id and the matched code, or null if not found / self-referral.
 */
export async function resolveReferral(
  supabase: SupabaseClient,
  codeInput: string,
  excludeUserId?: string | null
): Promise<ResolvedReferral | null> {
  const raw = (codeInput ?? '').trim()
  if (!raw) return null

  const normalized = normalizeCode(raw)

  // 1) Exact match
  const { data: exact } = await supabase
    .from('referral_codes')
    .select('user_id, code')
    .eq('code', raw)
    .maybeSingle()
  if (exact?.user_id) {
    if (excludeUserId && exact.user_id === excludeUserId) return null
    return { user_id: exact.user_id, code: exact.code }
  }

  // 2) Normalized match (e.g. "fb-abc12345" or "ABC12345" -> "FB-ABC12345")
  const { data: norm } = await supabase
    .from('referral_codes')
    .select('user_id, code')
    .eq('code', normalized)
    .maybeSingle()
  if (norm?.user_id) {
    if (excludeUserId && norm.user_id === excludeUserId) return null
    return { user_id: norm.user_id, code: norm.code }
  }

  // 3) Fuzzy: fetch all codes and find one that matches (code includes input or input includes code)
  const { data: all } = await supabase
    .from('referral_codes')
    .select('user_id, code')
  if (!all?.length) return null

  const fuzzyInput = normalized.replace(/^FB-/, '')
  for (const row of all) {
    const rowCode = (row.code ?? '').trim().toUpperCase()
    const rowSuffix = rowCode.replace(/^FB-/, '')
    const match =
      rowCode === normalized ||
      rowSuffix === fuzzyInput ||
      (fuzzyInput.length >= 4 && rowSuffix.includes(fuzzyInput)) ||
      (rowSuffix.length >= 4 && fuzzyInput.includes(rowSuffix))
    if (match && row.user_id) {
      if (excludeUserId && row.user_id === excludeUserId) return null
      return { user_id: row.user_id, code: row.code }
    }
  }

  return null
}
