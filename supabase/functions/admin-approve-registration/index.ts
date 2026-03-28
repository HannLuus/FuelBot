import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser, escapeHtml } from '../_shared/adminAuth.ts'
import { emailLogoHtml, getAppBaseUrl, RESEND_FROM } from '../_shared/emailHeader.ts'
import {
  buildInvoiceEmailHtml,
  getInvoiceCommercialTaxPercent,
  getInvoiceCompanyName,
  getInvoiceSupportEmail,
  splitTaxInclusiveTotalMmk,
} from '../_shared/invoiceHtml.ts'
import { Resend } from 'npm:resend@2.0.0'

const STATION_ANNUAL_MMK = Number(Deno.env.get('STATION_SUBSCRIPTION_ANNUAL_MMK') ?? Deno.env.get('TIER_PRICE_SMALL_MMK') ?? '120000')
const TIER_PRICE: Record<string, number> = {
  small: STATION_ANNUAL_MMK,
  medium: STATION_ANNUAL_MMK,
  large: STATION_ANNUAL_MMK,
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
    .select(
      'id, name, township, city, is_verified, verified_owner_id, subscription_tier_requested, referrer_user_id, payment_received_at, payment_method, payment_reference, subscription_duration_months, subscription_price_paid_mmk, subscription_promo_applied, subscription_promo_percent',
    )
    .eq('id', payload.station_id)
    .single()

  if (stationErr || !station) return json({ error: 'Station not found' }, 404)
  if (station.is_verified) {
    return json({ error: 'Station is already verified' }, 400)
  }
  if (!station.payment_received_at) {
    return json({ error: 'Payment must be marked received before approval' }, 400)
  }

  const referrerIsStationOwner = station.referrer_user_id
    ? (await service.from('stations').select('id').eq('verified_owner_id', station.referrer_user_id).limit(1).maybeSingle()).data != null
    : false
  const grantReferralReward = !!station.referrer_user_id && !referrerIsStationOwner

  const { error: updateErr } = await service
    .from('stations')
    .update({
      is_verified: true,
      verification_source: 'owner',
      owner_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      referral_reward_status: grantReferralReward ? 'PENDING' : null,
      registration_reject_reason: null,
      registration_rejected_at: null,
    })
    .eq('id', payload.station_id)

  if (updateErr) {
    console.error('admin-approve-registration update error:', updateErr)
    return json({ error: 'Failed to approve station' }, 500)
  }

  const tier = String(station.subscription_tier_requested ?? '').toLowerCase()
  const tierPrice = TIER_PRICE[tier] ?? STATION_ANNUAL_MMK
  const subscriptionTotalMmk =
    station.subscription_price_paid_mmk != null
      ? Math.round(Number(station.subscription_price_paid_mmk))
      : Math.round(tierPrice)
  const durationMonths = station.subscription_duration_months
  const amountMmk = Math.round(subscriptionTotalMmk * 0.15)

  if (grantReferralReward && amountMmk > 0) {
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

  const resendApi = Deno.env.get('RESEND_API_KEY')
  if (resendApi) {
    try {
      const resend = new Resend(resendApi)
      const appUrl = getAppBaseUrl()
      const appOrigin = new URL(appUrl).origin
      const stationLabel = `${station.name} (${station.township}, ${station.city})`
      const taxPercent = getInvoiceCommercialTaxPercent()
      const { subtotalMmk, taxMmk, totalMmk } = splitTaxInclusiveTotalMmk(subscriptionTotalMmk, taxPercent)
      const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Standard'
      const esc = (s: string) => escapeHtml(String(s ?? ''))
      const safeStationLabel = `${esc(station.name)} (${esc(String(station.township ?? ''))}, ${esc(String(station.city ?? ''))})`
      const promoApplied = !!station.subscription_promo_applied
      const promoPct = station.subscription_promo_percent != null ? Number(station.subscription_promo_percent) : null
      const hasSnapshotDuration = durationMonths != null && [3, 6, 12].includes(Number(durationMonths))
      const hasSnapshotPrice = station.subscription_price_paid_mmk != null
      const durationPart = hasSnapshotDuration
        ? `${Number(durationMonths)}-month station subscription`
        : hasSnapshotPrice
          ? 'Station subscription'
          : 'Annual station subscription'
      const promoPart =
        promoApplied && promoPct != null && promoPct > 0 ? ` · Promo ${esc(String(promoPct))}% off list` : ''
      const lineDescriptionHtml = `${esc(durationPart)} — ${esc(tierLabel)} tier (${safeStationLabel})${promoPart}`

      if (station.verified_owner_id) {
        const ownerUser = await service.auth.admin.getUserById(station.verified_owner_id)
        const ownerEmail = ownerUser.data.user?.email

        let invoiceNumber: string | null = null
        if (ownerEmail) {
          const { data: invNum, error: invNumErr } = await service.rpc('allocate_invoice_number')
          if (invNumErr) {
            console.error('allocate_invoice_number error:', invNumErr)
          } else if (typeof invNum === 'string') {
            invoiceNumber = invNum
          }
        }

        if (invoiceNumber) {
          const { error: invInsErr } = await service.from('invoices').insert({
            invoice_number: invoiceNumber,
            kind: 'station_subscription',
            customer_user_id: station.verified_owner_id,
            station_id: station.id,
            line_description: (() => {
              const base =
                hasSnapshotDuration
                  ? `${Number(durationMonths)}-month station subscription — ${tierLabel} tier (${station.name}, ${String(station.township ?? '')})`
                  : hasSnapshotPrice
                    ? `Station subscription — ${tierLabel} tier (${station.name}, ${String(station.township ?? '')})`
                    : `Annual station subscription — ${tierLabel} tier (${station.name}, ${String(station.township ?? '')})`
              const promoNote =
                promoApplied && promoPct != null && promoPct > 0 ? ` · promo ${promoPct}%` : ''
              return base + promoNote
            })(),
            subtotal_mmk: subtotalMmk,
            tax_rate_percent: taxPercent,
            tax_mmk: taxMmk,
            total_mmk: totalMmk,
            payment_method: station.payment_method ?? null,
            payment_reference: station.payment_reference ?? null,
          })
          if (invInsErr) {
            console.error('invoices insert error:', invInsErr)
            invoiceNumber = null
          }
        }

        if (ownerEmail) {
          const payoutBlock = grantReferralReward && amountMmk > 0
            ? `<div style="max-width:600px;margin:0 auto 24px;padding:0 12px;font-family:Georgia,serif">
              <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;border-left:4px solid #1d4ed8;padding-left:14px">
                <strong>Referral payout (Option B):</strong> Please pay <strong>${amountMmk.toLocaleString('en-US')} MMK</strong> to the referrer linked to this station, as arranged with FuelBot.
              </p>
            </div>`
            : ''

          const thankYou =
            'Thank you for partnering with FuelBot. Your verified listing helps drivers find reliable fuel updates—we are glad to have you on board.'

          let ownerHtml: string
          if (invoiceNumber) {
            ownerHtml =
              buildInvoiceEmailHtml({
                appOrigin,
                invoiceNumber,
                issuedDateLabel: new Date().toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'Asia/Yangon',
                }),
                companyName: escapeHtml(getInvoiceCompanyName()),
                supportEmail: escapeHtml(getInvoiceSupportEmail()),
                billToName: esc(station.name),
                billToEmail: escapeHtml(ownerEmail),
                lineDescription: lineDescriptionHtml,
                taxPercent,
                subtotalMmk,
                taxMmk,
                totalMmk,
                paymentMethod: station.payment_method,
                paymentReference: station.payment_reference,
                thankYouMessage: escapeHtml(thankYou),
              }) + payoutBlock
          } else {
            ownerHtml =
              emailLogoHtml(appUrl) +
              `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:16px;color:#334155">
              <h2 style="color:#0f172a">Station verified</h2>
              <p>We received your payment. Your station <strong>${safeStationLabel}</strong> is now verified.</p>
              <p>Tier: ${esc(tier || '—')}</p>
              <p><a href="${escapeHtml(appUrl + '/station')}" style="color:#1d4ed8">Open your station dashboard</a></p>
            </div>` +
              payoutBlock
          }

          await resend.emails.send({
            from: RESEND_FROM,
            to: [ownerEmail],
            subject: invoiceNumber
              ? `FuelBot — Invoice ${invoiceNumber} · Station verified`
              : 'FuelBot: payment received and station verified',
            html: ownerHtml,
          })
        }
      }

      if (grantReferralReward && amountMmk > 0) {
        const refUser = await service.auth.admin.getUserById(station.referrer_user_id)
        const refEmail = refUser.data.user?.email
        if (refEmail) {
          await resend.emails.send({
            from: RESEND_FROM,
            to: [refEmail],
            subject: 'FuelBot: referral reward pending collection',
            html: emailLogoHtml(appUrl) + `
              <h3>You earned a referral reward</h3>
              <p>Station: <strong>${escapeHtml(stationLabel)}</strong></p>
              <p>Amount: <strong>${amountMmk.toLocaleString('en-US')} MMK</strong> (15%)</p>
              <p>Option B: collect this from the station owner as instructed by FuelBot.</p>
              <p>Open app: <a href="${escapeHtml(appUrl + '/station')}">${escapeHtml(appUrl + '/station')}</a></p>
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
