import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser, escapeHtml } from '../_shared/adminAuth.ts'
import { emailLogoHtml, RESEND_FROM } from '../_shared/emailHeader.ts'
import { Resend } from 'npm:resend@2.0.0'

const EXPECTED_AMOUNT_MMK = Number(Deno.env.get('STATION_SUBSCRIPTION_ANNUAL_MMK') ?? '120000')

interface Payload {
  station_id: string
  payment_method?: string | null
  payment_reference?: string | null
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

  const paymentMethod = payload.payment_method?.trim() || null
  const paymentReference = payload.payment_reference?.trim() || null
  const screenshotPath = payload.screenshot_path?.trim() || null
  if (!paymentReference) return json({ error: 'payment_reference is required' }, 400)

  const { error: updateErr } = await service
    .from('stations')
    .update({
      payment_reported_at: new Date().toISOString(),
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      payment_screenshot_path: screenshotPath,
    })
    .eq('id', payload.station_id)

  if (updateErr) {
    console.error('operator-report-payment update error:', updateErr)
    return json({ error: 'Failed to record payment reported' }, 500)
  }

  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? Deno.env.get('ADMIN_EMAIL')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const appUrl = Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app/admin'
  const appBaseUrl = Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app'

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
          <p><strong>Expected amount:</strong> ${EXPECTED_AMOUNT_MMK.toLocaleString('en-US')} MMK</p>
          <p><strong>Payment method:</strong> ${escapeHtml(paymentMethod || '—')}</p>
          <p><strong>Payment reference:</strong> ${escapeHtml(paymentReference || '—')}</p>
          ${screenshotPath ? `<p><strong>Payment screenshot:</strong> ${escapeHtml(screenshotPath)} (check Storage bucket b2b-payment-screenshots)</p>` : ''}
          <p>Please verify the payment in your wallet/bank and mark payment received in the admin panel.</p>
          <p><a href="${escapeHtml(appUrl)}">Open admin panel</a></p>
        `,
      })
    } catch (err) {
      console.error('operator-report-payment notify error:', err)
    }
  }

  return json({ success: true })
})
