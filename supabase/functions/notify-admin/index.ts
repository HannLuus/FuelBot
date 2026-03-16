import { Resend } from 'npm:resend@2.0.0'
import { corsHeaders, json, requireAuthedUser, escapeHtml } from '../_shared/adminAuth.ts'
import { emailLogoHtml, RESEND_FROM } from '../_shared/emailHeader.ts'

interface Payload {
  kind: 'PENDING_REGISTRATION' | 'PENDING_CLAIM' | 'PENDING_SUGGESTION'
  station_name?: string
  station_id?: string
  claim_id?: string
  suggestion_id?: string
  suggestion_city?: string
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

  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? Deno.env.get('ADMIN_EMAIL')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const appUrl = Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app/admin'

  if (!resendKey) {
    console.warn('notify-admin skipped: RESEND_API_KEY missing')
    return json({ success: true, skipped: true })
  }

  if (!adminEmail) {
    console.error('notify-admin skipped: ADMIN_NOTIFICATION_EMAIL is not configured')
    return json({ success: true, skipped: true })
  }

  const resend = new Resend(resendKey)

  const subject =
    payload.kind === 'PENDING_CLAIM'
      ? 'FuelBot: station claim needs approval'
      : payload.kind === 'PENDING_SUGGESTION'
        ? 'FuelBot: new station suggestion needs review'
        : 'FuelBot: station registration needs approval'

  const details =
    payload.kind === 'PENDING_CLAIM'
      ? `Claim ID: ${escapeHtml(payload.claim_id ?? '-')}`
      : payload.kind === 'PENDING_SUGGESTION'
        ? `Suggested station: ${escapeHtml(payload.station_name ?? '-')}${payload.suggestion_city ? ', ' + escapeHtml(payload.suggestion_city) : ''} (ID: ${escapeHtml(payload.suggestion_id ?? '-')})`
        : `Station: ${escapeHtml(payload.station_name ?? '-')} (${escapeHtml(payload.station_id ?? '-')})`

  const appBaseUrl = Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app'
  const html = emailLogoHtml(appBaseUrl) + `
    <h2>FuelBot admin action required</h2>
    <p>${details}</p>
    <p>Please review in admin panel: <a href="${appUrl}">${appUrl}</a></p>
  `

  try {
    await resend.emails.send({
      from: RESEND_FROM,
      to: [adminEmail],
      subject,
      html,
    })
  } catch (err) {
    console.error('notify-admin send error:', err)
    return json({ error: 'Failed to send admin email' }, 500)
  }

  return json({ success: true })
})
