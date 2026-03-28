import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env variables')
}

function projectRefFromSupabaseUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(hostname)
    return m ? m[1].toLowerCase() : null
  } catch {
    return null
  }
}

function projectRefFromAnonJwt(jwt: string): string | null {
  try {
    const parts = jwt.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64
    const payload = JSON.parse(atob(padded)) as { ref?: string }
    return typeof payload.ref === 'string' ? payload.ref.toLowerCase() : null
  } catch {
    return null
  }
}

const urlRef = projectRefFromSupabaseUrl(supabaseUrl)
const keyRef = projectRefFromAnonJwt(supabaseAnonKey)

if (!urlRef) {
  throw new Error(
    'VITE_SUPABASE_URL must look like https://YOUR_PROJECT_REF.supabase.co (copy Project URL from Supabase → Settings → API).',
  )
}
if (!keyRef) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY is not a valid Supabase anon key (missing ref claim). Paste anon public from Settings → API.',
  )
}
if (urlRef !== keyRef) {
  throw new Error(
    `VITE_SUPABASE_URL is for project "${urlRef}" but the anon key is for "${keyRef}". Use both from the same Supabase project, remove duplicate VITE_* lines in .env / .env.local, then restart the dev server.`,
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
