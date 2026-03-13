import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@2.0.0'
import { emailLogoHtml } from '../_shared/emailHeader.ts'
import { resolveReferral } from '../_shared/referralResolver.ts'
import { escapeHtml } from '../_shared/adminAuth.ts'

const YANGON_LAT = 16.8661
const YANGON_LNG = 96.1561

interface RegisterPayload {
  name: string
  brand?: string | null
  address?: string | null
  township?: string
  city?: string
  lat?: number
  lng?: number
  subscription_tier_requested?: 'small' | 'medium' | 'large'
  referral_code?: string | null
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function cors() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors()

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const token = authHeader.replace('Bearer ', '')
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token)
  if (userError || !user) return json({ error: 'Invalid or expired session' }, 401)

  let body: RegisterPayload
  try {
    body = (await req.json()) as RegisterPayload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const name = (body.name ?? '').trim()
  if (name.length < 2) return json({ error: 'Station name is required (at least 2 characters)' }, 400)

  const lat = body.lat ?? YANGON_LAT
  const lng = body.lng ?? YANGON_LNG
  const township = (body.township ?? '').trim() || '—'
  const city = (body.city ?? '').trim() || 'Yangon'
  const address_text = (body.address ?? '').trim() || null
  const brand = (body.brand ?? '').trim() || null
  const requestedTier = body.subscription_tier_requested ?? null
  const referralCodeRaw = (body.referral_code ?? '').trim().toUpperCase()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let referrerUserId: string | null = null
  if (referralCodeRaw) {
    const resolved = await resolveReferral(supabase, referralCodeRaw, user.id)
    if (!resolved) {
      const selfCheck = await resolveReferral(supabase, referralCodeRaw, null)
      if (selfCheck && selfCheck.user_id === user.id) {
        return json({ error: 'Cannot use your own referral code' }, 400)
      }
      return json({ error: 'Invalid referral code' }, 400)
    }
    referrerUserId = resolved.user_id
  }

  // Guard against spam registrations: cap pending (unpaid) stations per user at 3
  const { count: pendingCount } = await supabase
    .from('stations')
    .select('id', { count: 'exact', head: true })
    .eq('verified_owner_id', user.id)
    .is('payment_received_at', null)

  if ((pendingCount ?? 0) >= 3) {
    return json(
      { error: 'You already have 3 pending registrations. Please wait for approval before submitting another.' },
      429,
    )
  }

  const { data: station, error: insertErr } = await supabase
    .from('stations')
    .insert({
      name,
      brand,
      address_text,
      township,
      city,
      country_code: 'MM',
      lat,
      lng,
      is_active: true,
      is_verified: false,
      verified_owner_id: user.id,
      subscription_tier_requested: requestedTier,
      referrer_user_id: referrerUserId,
      registration_reject_reason: null,
      registration_rejected_at: null,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('register-station insert error:', insertErr)
    return json({ error: 'Failed to register station' }, 500)
  }

  const resendApi = Deno.env.get('RESEND_API_KEY')
  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? Deno.env.get('ADMIN_EMAIL')
  if (resendApi && adminEmail) {
    try {
      const resend = new Resend(resendApi)
      const appUrl = Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app'
      await resend.emails.send({
        from: 'FuelBot <onboarding@resend.dev>',
        to: [adminEmail],
        subject: 'FuelBot: station registration needs approval',
        html: emailLogoHtml(appUrl) + `
          <h3>New station registration pending review</h3>
          <p>Station: ${escapeHtml(name)}</p>
          <p>Township: ${escapeHtml(township)}</p>
          <p>City: ${escapeHtml(city)}</p>
        `,
      })
    } catch (err) {
      console.error('register-station notify error:', err)
    }
  }

  return json({ success: true, station }, 200)
})
