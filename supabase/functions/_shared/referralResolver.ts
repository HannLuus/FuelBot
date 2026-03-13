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

  // 3) Fuzzy: DB-side ILIKE search on the suffix portion, strictly sanitised and limited.
  // Only attempt if the suffix is at least 4 alphanumeric characters to avoid broad matches.
  const fuzzyInput = normalized.replace(/^FB-/, '').replace(/[^A-Z0-9]/g, '')
  if (fuzzyInput.length < 4) return null

  const { data: fuzzy } = await supabase
    .from('referral_codes')
    .select('user_id, code')
    .ilike('code', `%${fuzzyInput}%`)
    .limit(1)
    .maybeSingle()

  if (fuzzy?.user_id) {
    if (excludeUserId && fuzzy.user_id === excludeUserId) return null
    return { user_id: fuzzy.user_id, code: fuzzy.code }
  }

  return null
}
