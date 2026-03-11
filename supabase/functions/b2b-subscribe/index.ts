import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser } from '../_shared/adminAuth.ts'
import { Resend } from 'npm:resend@2.0.0'

const EXPECTED_AMOUNT_MMK = Number(Deno.env.get('STATION_SUBSCRIPTION_ANNUAL_MMK') ?? '120000')

interface Payload {
  payment_method: string
  payment_reference: string
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
      payment_method: payload.payment_method,
      payment_reference: payload.payment_reference,
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
      await resend.emails.send({
        from: 'FuelBot <onboarding@resend.dev>',
        to: [adminEmail],
        subject: 'FuelBot: B2B route access payment reported',
        html: `
          <h2>B2B Route Access Payment Reported</h2>
          <p>A user has signed up for B2B route access (all routes).</p>
          <p><strong>User ID:</strong> ${authed.user.id}</p>
          <p><strong>User Email:</strong> ${authed.user.email}</p>
          <p><strong>Expected amount:</strong> ${EXPECTED_AMOUNT_MMK.toLocaleString('en-US')} MMK</p>
          <p><strong>Payment Method:</strong> ${payload.payment_method}</p>
          <p><strong>Payment Reference:</strong> ${payload.payment_reference}</p>
          <p>Please verify the payment in your wallet/bank. If this is a fake payment, delete the row in the b2b_subscriptions table.</p>
        `,
      })
    } catch (err) {
      console.error('b2b-subscribe notify error:', err)
    }
  }

  return json({ success: true })
})
