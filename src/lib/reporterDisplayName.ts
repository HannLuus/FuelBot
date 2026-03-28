import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export const REPORTER_DISPLAY_NAME_MIN = 2
export const REPORTER_DISPLAY_NAME_MAX = 30

/** Base suggestion from OAuth / email (before uniqueness pass). */
export function buildBaseDisplayNameSuggestion(user: User): string {
  const meta = user.user_metadata ?? {}
  const fromMeta = String(meta.full_name ?? meta.name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (fromMeta.length >= REPORTER_DISPLAY_NAME_MIN) {
    return fromMeta.slice(0, REPORTER_DISPLAY_NAME_MAX)
  }
  const email = user.email ?? ''
  const local = email.split('@')[0]?.trim() ?? ''
  const ascii = local.replace(/[^a-zA-Z0-9._-]+/g, '').slice(0, REPORTER_DISPLAY_NAME_MAX)
  if (ascii.length >= REPORTER_DISPLAY_NAME_MIN) return ascii
  return ''
}

export function normalizeDisplayNameInput(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function validateDisplayNameForSave(normalized: string): 'ok' | 'too_short' | 'too_long' {
  if (normalized.length < REPORTER_DISPLAY_NAME_MIN) return 'too_short'
  if (normalized.length > REPORTER_DISPLAY_NAME_MAX) return 'too_long'
  return 'ok'
}

/**
 * If exact `display_name` is taken by another user, try `Name 2`, `Name 3`, … (still ≤ max length).
 */
export async function findAvailableDisplayName(
  client: SupabaseClient,
  baseRaw: string,
  currentUserId: string,
): Promise<string> {
  const base = normalizeDisplayNameInput(baseRaw).slice(0, REPORTER_DISPLAY_NAME_MAX)
  if (base.length < REPORTER_DISPLAY_NAME_MIN) return base

  for (let i = 0; i < 40; i++) {
    const suffix = i === 0 ? '' : ` ${i + 1}`
    const room = REPORTER_DISPLAY_NAME_MAX - suffix.length
    const candidate = (base.slice(0, Math.max(REPORTER_DISPLAY_NAME_MIN, room)) + suffix).trim()
    if (candidate.length < REPORTER_DISPLAY_NAME_MIN) continue

    const { data, error } = await client
      .from('reporter_display_names')
      .select('user_id')
      .eq('display_name', candidate)
      .neq('user_id', currentUserId)
      .limit(1)

    if (error) return candidate
    if (!data?.length) return candidate
  }

  return `${base.slice(0, 10)}${Date.now() % 100000}`.slice(0, REPORTER_DISPLAY_NAME_MAX)
}
