import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser, escapeHtml } from '../_shared/adminAuth.ts'
import { emailLogoHtml, getAppBaseUrl, RESEND_FROM } from '../_shared/emailHeader.ts'
import { quoteB2BPrice, type B2BPricingConfigRow } from '../_shared/b2bPricing.ts'
import { Resend } from 'npm:resend@2.0.0'

interface Payload {
  payment_method: string
  payment_reference: string
  duration_months: 3 | 6 | 12
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

  if (!payload.payment_reference?.trim()) {
    return json({ error: 'payment_reference is required' }, 400)
  }
  if (payload.payment_method !== 'KBZ_PAY') {
    return json({ error: 'Only KBZ Pay (KPay) is accepted' }, 400)
  }
  if (![3, 6, 12].includes(Number(payload.duration_months))) {
    return json({ error: 'duration_months must be one of 3, 6, or 12' }, 400)
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
    .or(`status.eq.PENDING,and(status.eq.CONFIRMED,valid_until.gt.${new Date().toISOString()})`)
    .limit(1)

  if (existingErr) {
    console.error('b2b-subscribe existing error:', existingErr)
    return json({ error: 'Failed to check existing subscriptions' }, 500)
  }

  if (existing && existing.length > 0) {
    return json({ error: 'User already has an active B2B subscription' }, 400)
  }

  const { data: pricing } = await service
    .from('b2b_pricing_config')
    .select('list_price_3m_mmk, list_price_6m_mmk, list_price_12m_mmk, promo_price_3m_mmk, promo_price_6m_mmk, promo_price_12m_mmk, promo_enabled, promo_starts_at, promo_ends_at')
    .eq('id', 'default')
    .maybeSingle()
  const cfg = (pricing ?? {
    list_price_3m_mmk: 36000,
    list_price_6m_mmk: 72000,
    list_price_12m_mmk: 144000,
    promo_price_3m_mmk: 28800,
    promo_price_6m_mmk: 57600,
    promo_price_12m_mmk: 115200,
    promo_enabled: true,
    promo_starts_at: null,
    promo_ends_at: null,
  }) as B2BPricingConfigRow
  const quote = quoteB2BPrice(cfg, payload.duration_months)
  const nowIso = new Date().toISOString()

  const { error: insertErr } = await service
    .from('b2b_subscriptions')
    .insert({
      user_id: authed.user.id,
      plan_type: 'route_view',
      route_id: null,
      // Entitlement starts at admin confirmation; keep pending rows inert.
      valid_until: nowIso,
      status: 'PENDING',
      payment_method: payload.payment_method,
      payment_reference: payload.payment_reference,
      duration_months: payload.duration_months,
      price_list_mmk: quote.listPriceMmk,
      price_promo_mmk: quote.promoPriceMmk,
      price_paid_mmk: quote.paidPriceMmk,
      promo_applied: quote.promoApplied,
      promo_percent: quote.promoPercent,
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
          <p><strong>Plan duration:</strong> ${payload.duration_months} months</p>
          <p><strong>List price:</strong> ${quote.listPriceMmk.toLocaleString('en-US')} MMK</p>
          <p><strong>Promo price:</strong> ${quote.promoPriceMmk.toLocaleString('en-US')} MMK</p>
          <p><strong>Expected amount paid:</strong> ${quote.paidPriceMmk.toLocaleString('en-US')} MMK ${quote.promoApplied ? '(promo active)' : '(no promo)'}</p>
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
