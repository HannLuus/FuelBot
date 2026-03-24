import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser, escapeHtml } from '../_shared/adminAuth.ts'
import { emailLogoHtml, getAppAdminUrl, getAppBaseUrl, RESEND_FROM } from '../_shared/emailHeader.ts'
import { quoteB2BPrice, type B2BPricingConfigRow } from '../_shared/b2bPricing.ts'
import { Resend } from 'npm:resend@2.0.0'

/** Optional suffix from older app versions: "KPayRef [6m]". Payload duration wins when both are set. */
const PAY_REF_DURATION_SUFFIX = /\s*\[(3|6|12)m\]\s*$/i

function resolveDurationAndCleanReference(
  rawReference: string,
  payloadDuration: 3 | 6 | 12 | undefined,
): { cleanReference: string; durationMonths: 3 | 6 | 12 } {
  let ref = rawReference.trim()
  let duration: 3 | 6 | 12 | undefined = payloadDuration

  const match = ref.match(PAY_REF_DURATION_SUFFIX)
  if (match) {
    const fromSuffix = Number(match[1]) as 3 | 6 | 12
    if (!duration) duration = fromSuffix
    const cut = match.index ?? ref.length - match[0].length
    ref = ref.slice(0, cut).trim()
  }
  if (!duration) duration = 12
  return { cleanReference: ref, durationMonths: duration }
}

interface Payload {
  station_id: string
  payment_method?: string | null
  payment_reference?: string | null
  screenshot_path?: string | null
  /** Plan length; defaults to 12 for older clients (annual-style fallback). */
  duration_months?: 3 | 6 | 12
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

  if (!payload.station_id) return json({ error: 'station_id is required' }, 400)

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: station, error: stationErr } = await service
    .from('stations')
    .select('id, name, township, city, verified_owner_id, payment_reported_at')
    .eq('id', payload.station_id)
    .single()

  if (stationErr || !station) return json({ error: 'Station not found' }, 404)
  if (station.verified_owner_id !== authed.user.id) return json({ error: 'Forbidden' }, 403)

  if (station.payment_reported_at) {
    return json({ success: true, already_reported: true })
  }

  const rawPaymentRef = payload.payment_reference?.trim() || ''
  const screenshotPath = payload.screenshot_path?.trim() || null
  if (!rawPaymentRef) return json({ error: 'payment_reference is required' }, 400)

  if (payload.duration_months != null && ![3, 6, 12].includes(Number(payload.duration_months))) {
    return json({ error: 'duration_months must be one of 3, 6, or 12' }, 400)
  }

  const { cleanReference: paymentReference, durationMonths } = resolveDurationAndCleanReference(
    rawPaymentRef,
    payload.duration_months,
  )
  if (!paymentReference) {
    return json({ error: 'payment_reference must include the wallet reference (not only a duration tag)' }, 400)
  }

  const { data: pricing } = await service
    .from('b2b_pricing_config')
    .select(
      'list_price_3m_mmk, list_price_6m_mmk, list_price_12m_mmk, promo_price_3m_mmk, promo_price_6m_mmk, promo_price_12m_mmk, promo_enabled, promo_starts_at, promo_ends_at',
    )
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
  const quote = quoteB2BPrice(cfg, durationMonths)

  const paymentMethod = 'KBZ_PAY'

  const { error: updateErr } = await service
    .from('stations')
    .update({
      payment_reported_at: new Date().toISOString(),
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      payment_screenshot_path: screenshotPath,
      subscription_duration_months: durationMonths,
      subscription_price_list_mmk: Math.round(quote.listPriceMmk),
      subscription_price_promo_mmk: Math.round(quote.promoPriceMmk),
      subscription_price_paid_mmk: Math.round(quote.paidPriceMmk),
      subscription_promo_applied: quote.promoApplied,
      subscription_promo_percent: quote.promoPercent,
    })
    .eq('id', payload.station_id)

  if (updateErr) {
    console.error('operator-report-payment update error:', updateErr)
    return json({ error: 'Failed to record payment reported' }, 500)
  }

  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? Deno.env.get('ADMIN_EMAIL')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const appUrl = getAppAdminUrl()
  const appBaseUrl = getAppBaseUrl()

  if (resendKey && adminEmail) {
    try {
      const resend = new Resend(resendKey)
      const stationLabel = `${escapeHtml(station.name)} (${escapeHtml(station.township)}, ${escapeHtml(station.city)})`
      await resend.emails.send({
        from: RESEND_FROM,
        to: [adminEmail],
        subject: 'FuelBot: payment reported – please verify',
        html: emailLogoHtml(appBaseUrl) + `
          <h2>Payment reported – please verify</h2>
          <p>A station owner has reported that they have paid.</p>
          <p><strong>Station:</strong> ${stationLabel}</p>
          <p><strong>Station ID:</strong> ${escapeHtml(station.id)}</p>
          <p><strong>Plan duration:</strong> ${durationMonths} months</p>
          <p><strong>List price:</strong> ${quote.listPriceMmk.toLocaleString('en-US')} MMK</p>
          <p><strong>Promo price:</strong> ${quote.promoPriceMmk.toLocaleString('en-US')} MMK</p>
          <p><strong>Expected amount paid:</strong> ${quote.paidPriceMmk.toLocaleString('en-US')} MMK ${quote.promoApplied ? '(promo active)' : '(no promo)'}</p>
          <p><strong>Payment method:</strong> ${escapeHtml(paymentMethod || '—')}</p>
          <p><strong>Payment reference:</strong> ${escapeHtml(paymentReference || '—')}</p>
          ${screenshotPath ? `<p><strong>Payment screenshot:</strong> ${escapeHtml(screenshotPath)} (check Storage bucket b2b-payment-screenshots)</p>` : ''}
          <p>Please verify the payment in KBZ Pay and mark payment received in the admin panel.</p>
          <p><a href="${escapeHtml(appUrl)}">Open admin panel</a></p>
        `,
      })
    } catch (err) {
      console.error('operator-report-payment notify error:', err)
    }
  }

  return json({ success: true })
})
