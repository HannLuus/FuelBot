import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'
import { emailLogoHtml } from '../_shared/emailHeader.ts'
import { Resend } from 'npm:resend@2.0.0'

interface Payload {
  station_id: string
  reason?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  const admin = await requireAdminUser(req.headers.get('Authorization'))
  if ('error' in admin) return admin.error

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

  const reason = payload.reason?.trim() || 'Registration rejected by admin.'

  const { data: station } = await service
    .from('stations')
    .select('name, township, city, verified_owner_id')
    .eq('id', payload.station_id)
    .maybeSingle()

  const { error } = await service
    .from('stations')
    .update({
      is_verified: false,
      payment_received_at: null,
      payment_reported_at: null,
      payment_method: null,
      payment_reference: null,
      payment_confirmed_by: null,
      referral_reward_status: null,
      registration_reject_reason: reason,
      registration_rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.station_id)

  if (error) {
    console.error('admin-reject-registration error:', error)
    return json({ error: 'Failed to reject station registration' }, 500)
  }

  const resendApi = Deno.env.get('RESEND_API_KEY')
  if (resendApi && station?.verified_owner_id) {
    try {
      const resend = new Resend(resendApi)
      const ownerUser = await service.auth.admin.getUserById(station.verified_owner_id)
      const ownerEmail = ownerUser.data.user?.email
      if (ownerEmail) {
        const appUrl = Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app'
        await resend.emails.send({
          from: 'FuelBot <onboarding@resend.dev>',
          to: [ownerEmail],
          subject: 'FuelBot: station registration rejected',
          html: emailLogoHtml(appUrl) + `
            <h3>Registration rejected</h3>
            <p>Station: <strong>${station.name} (${station.township}, ${station.city})</strong></p>
            <p>Reason: ${reason}</p>
            <p>You can update details and submit again in the operator portal.</p>
            <p><a href="${appUrl}/operator">${appUrl}/operator</a></p>
          `,
        })
      }
    } catch (notifyErr) {
      console.error('admin-reject-registration notify error:', notifyErr)
    }
  }

  return json({ success: true })
})
