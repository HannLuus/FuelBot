import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser, escapeHtml } from '../_shared/adminAuth.ts'
import { emailLogoHtml, getAppBaseUrl, RESEND_FROM } from '../_shared/emailHeader.ts'
import { Resend } from 'npm:resend@2.0.0'

const EXPECTED_AMOUNT_MMK = Number(Deno.env.get('STATION_SUBSCRIPTION_ANNUAL_MMK') ?? '120000')

interface Payload {
  payment_method: string
  payment_reference: string
  screenshot_path?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  const authed = await requireAuthedUser(req.headers.get('Authorization'))
  if ('error' in authed) return authed.error

  let payload: Payload
  try {
    payload = await req.json() as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  if (!payload.payment_method || !payload.payment_reference) {
    return json({ error: 'payment_method and payment_reference are required' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Check if user already has an active b2b_subscription
  const { data: existing, error: existingErr } = await service
    .from('b2b_subscriptions')
    .select('id')
    .eq('user_id', authed.user.id)
    .gt('valid_until', new Date().toISOString())
    .in('status', ['PENDING', 'CONFIRMED'])
    .limit(1)

  if (existingErr) {
    console.error('b2b-subscribe existing error:', existingErr)
    return json({ error: 'Failed to check existing subscriptions' }, 500)
  }

  if (existing && existing.length > 0) {
    return json({ error: 'User already has an active B2B subscription' }, 400)
  }

  // Insert new subscription: valid for 1 year from now
  const validUntil = new Date()
  validUntil.setFullYear(validUntil.getFullYear() + 1)

  const { error: insertErr } = await service
    .from('b2b_subscriptions')
    .insert({
      user_id: authed.user.id,
      plan_type: 'route_view',
      route_id: null,
      valid_until: validUntil.toISOString(),
      status: 'PENDING',
      payment_method: payload.payment_method,
      payment_reference: payload.payment_reference,
      screenshot_path: payload.screenshot_path?.trim() || null,
    })

  if (insertErr) {
    console.error('b2b-subscribe insert error:', insertErr)
    return json({ error: 'Failed to create subscription' }, 500)
  }

  // Notify admin
  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? Deno.env.get('ADMIN_EMAIL')
  const resendKey = Deno.env.get('RESEND_API_KEY')

  if (resendKey && adminEmail) {
    try {
      const resend = new Resend(resendKey)
      const appBaseUrl = getAppBaseUrl()
      await resend.emails.send({
        from: RESEND_FROM,
        to: [adminEmail],
        subject: 'FuelBot: B2B route access payment reported',
        html: emailLogoHtml(appBaseUrl) + `
          <h2>B2B Route Access Payment Reported</h2>
          <p>A user has signed up for B2B route access (all routes).</p>
          <p><strong>User ID:</strong> ${escapeHtml(authed.user.id)}</p>
          <p><strong>User Email:</strong> ${escapeHtml(authed.user.email ?? '—')}</p>
          <p><strong>Expected amount:</strong> ${EXPECTED_AMOUNT_MMK.toLocaleString('en-US')} MMK</p>
          <p><strong>Payment Method:</strong> ${escapeHtml(payload.payment_method)}</p>
          <p><strong>Payment Reference:</strong> ${escapeHtml(payload.payment_reference)}</p>
          ${payload.screenshot_path ? `<p><strong>Payment screenshot:</strong> ${escapeHtml(payload.screenshot_path)} (check Storage bucket b2b-payment-screenshots for review / future bot).</p>` : ''}
          <p>Please verify the payment in your wallet/bank. Confirm access in the admin panel, or reject if the payment is not found.</p>
        `,
      })
    } catch (err) {
      console.error('b2b-subscribe notify error:', err)
    }
  }

  return json({ success: true })
})
