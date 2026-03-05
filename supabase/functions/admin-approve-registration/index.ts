import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'
import { Resend } from 'npm:resend@2.0.0'

const TIER_PRICE: Record<string, number> = {
  small: Number(Deno.env.get('TIER_PRICE_SMALL_MMK') ?? '500000'),
  medium: Number(Deno.env.get('TIER_PRICE_MEDIUM_MMK') ?? '1200000'),
  large: Number(Deno.env.get('TIER_PRICE_LARGE_MMK') ?? '2500000'),
}

interface Payload {
  station_id: string
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

  const { data: station, error: stationErr } = await service
    .from('stations')
    .select('id, name, township, city, is_verified, verified_owner_id, subscription_tier_requested, referrer_user_id, payment_received_at')
    .eq('id', payload.station_id)
    .single()

  if (stationErr || !station) return json({ error: 'Station not found' }, 404)
  if (!station.payment_received_at) {
    return json({ error: 'Payment must be marked received before approval' }, 400)
  }

  const { error: updateErr } = await service
    .from('stations')
    .update({
      is_verified: true,
      updated_at: new Date().toISOString(),
      referral_reward_status: station.referrer_user_id ? 'PENDING' : null,
      registration_reject_reason: null,
      registration_rejected_at: null,
    })
    .eq('id', payload.station_id)

  if (updateErr) {
    console.error('admin-approve-registration update error:', updateErr)
    return json({ error: 'Failed to approve station' }, 500)
  }

  const tier = String(station.subscription_tier_requested ?? '').toLowerCase()
  const tierPrice = TIER_PRICE[tier] ?? 0
  const amountMmk = Math.round(tierPrice * 0.15)

  if (station.referrer_user_id) {
    if (amountMmk > 0) {
      const { error: rewardErr } = await service
        .from('referral_rewards')
        .upsert({
          referrer_user_id: station.referrer_user_id,
          station_id: station.id,
          amount_mmk: amountMmk,
          status: 'PENDING',
        }, { onConflict: 'station_id' })

      if (rewardErr) {
        console.error('admin-approve-registration reward upsert error:', rewardErr)
      }
    }
  }

  const resendApi = Deno.env.get('RESEND_API_KEY')
  if (resendApi) {
    try {
      const resend = new Resend(resendApi)
      const appUrl = Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app'
      const stationLabel = `${station.name} (${station.township}, ${station.city})`

      // Notify station owner about approval and Option B payout obligation.
      if (station.verified_owner_id) {
        const ownerUser = await service.auth.admin.getUserById(station.verified_owner_id)
        const ownerEmail = ownerUser.data.user?.email
        if (ownerEmail) {
          const payoutText = station.referrer_user_id && amountMmk > 0
            ? `\nReferral payout (Option B): Please pay ${amountMmk.toLocaleString('en-US')} MMK to the referrer linked to this station.`
            : ''
          await resend.emails.send({
            from: 'FuelBot <onboarding@resend.dev>',
            to: [ownerEmail],
            subject: 'FuelBot: your station has been approved',
            html: `
              <h3>Station approved</h3>
              <p>Your station is now verified: <strong>${stationLabel}</strong>.</p>
              <p>Tier: ${tier || '-'}</p>
              <p>${payoutText}</p>
              <p>Open app: <a href="${appUrl}/operator">${appUrl}/operator</a></p>
            `,
          })
        }
      }

      // Notify referrer with amount and station details.
      if (station.referrer_user_id && amountMmk > 0) {
        const refUser = await service.auth.admin.getUserById(station.referrer_user_id)
        const refEmail = refUser.data.user?.email
        if (refEmail) {
          await resend.emails.send({
            from: 'FuelBot <onboarding@resend.dev>',
            to: [refEmail],
            subject: 'FuelBot: referral reward pending collection',
            html: `
              <h3>You earned a referral reward</h3>
              <p>Station: <strong>${stationLabel}</strong></p>
              <p>Amount: <strong>${amountMmk.toLocaleString('en-US')} MMK</strong> (15%)</p>
              <p>Option B: collect this from the station owner as instructed by FuelBot.</p>
              <p>Open app: <a href="${appUrl}/operator">${appUrl}/operator</a></p>
            `,
          })
        }
      }
    } catch (notifyErr) {
      console.error('admin-approve-registration notify error:', notifyErr)
    }
  }

  return json({ success: true })
})
