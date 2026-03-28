/** Helpers for password-recovery flow. PKCE reset currently emits SIGNED_IN (not PASSWORD_RECOVERY) from auth-js; we also infer recovery from the access token and a same-tab session marker. */

export const PASSWORD_RECOVERY_REQUEST_TS_KEY = 'fuelbot_password_recovery_requested_at'

const RECOVERY_REQUEST_MAX_AGE_MS = 25 * 60 * 1000

export function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  try {
    const parts = accessToken.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function amrEntrySuggestsRecovery(entry: unknown): boolean {
  if (typeof entry === 'string') {
    return entry.toLowerCase().includes('recovery')
  }
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>
    const method = o.method ?? o.Method
    if (typeof method === 'string' && method.toLowerCase().includes('recovery')) {
      return true
    }
  }
  return false
}

/** True when the access token’s AMR indicates a recovery / reset-password session (GoTrue). */
export function accessTokenSuggestsPasswordRecoveryStep(payload: Record<string, unknown>): boolean {
  const amr = payload.amr
  if (!Array.isArray(amr)) return false
  return amr.some(amrEntrySuggestsRecovery)
}

export function sessionSuggestsPasswordRecoveryStep(session: { access_token: string } | null): boolean {
  if (!session?.access_token) return false
  const payload = decodeJwtPayload(session.access_token)
  return payload ? accessTokenSuggestsPasswordRecoveryStep(payload) : false
}

export function markPasswordRecoveryEmailSent(): void {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_REQUEST_TS_KEY, String(Date.now()))
  } catch {
    /* private mode / quota */
  }
}

export function clearPasswordRecoveryEmailMarker(): void {
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_REQUEST_TS_KEY)
  } catch {
    /* ignore */
  }
}

/** Same browser tab recently requested a reset email; pairs with PKCE return to /auth when JWT hints are missing. */
export function wasPasswordRecoveryEmailSentRecently(): boolean {
  try {
    const raw = sessionStorage.getItem(PASSWORD_RECOVERY_REQUEST_TS_KEY)
    if (!raw) return false
    const t = parseInt(raw, 10)
    if (Number.isNaN(t)) return false
    return Date.now() - t < RECOVERY_REQUEST_MAX_AGE_MS
  } catch {
    return false
  }
}
