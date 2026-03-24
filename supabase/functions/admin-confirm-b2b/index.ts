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

interface Payload {
  subscription_id: string
  action: 'confirm' | 'reject'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  const authed = await requireAdminUser(req.headers.get('Authorization'))
  if ('error' in authed) return authed.error

  let payload: Payload
  try {
    payload = await req.json() as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { subscription_id, action } = payload
  if (!subscription_id || (action !== 'confirm' && action !== 'reject')) {
    return json({ error: 'subscription_id and action ("confirm" | "reject") are required' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const newStatus = action === 'confirm' ? 'CONFIRMED' : 'REJECTED'
  let validUntilIso: string | null = null
  if (action === 'confirm') {
    const { data: pendingSub, error: pendingErr } = await service
      .from('b2b_subscriptions')
      .select('duration_months')
      .eq('id', subscription_id)
      .eq('status', 'PENDING')
      .single()
    if (pendingErr || !pendingSub) {
      console.error('admin-confirm-b2b pending read error:', pendingErr)
      return json({ error: 'Subscription not found or not in PENDING state' }, 404)
    }
    const durationMonths = [3, 6, 12].includes(Number(pendingSub.duration_months))
      ? Number(pendingSub.duration_months)
      : 12
    const validUntil = new Date()
    validUntil.setMonth(validUntil.getMonth() + durationMonths)
    validUntilIso = validUntil.toISOString()
  }

  const updatePayload: { status: string; updated_at: string; valid_until?: string } = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (action === 'confirm' && validUntilIso) {
    updatePayload.valid_until = validUntilIso
  }

  const { data, error: updateErr } = await service
    .from('b2b_subscriptions')
    .update(updatePayload)
    .eq('id', subscription_id)
    .eq('status', 'PENDING')
    .select('id, user_id, status, payment_method, payment_reference, plan_type, valid_until, duration_months, price_list_mmk, price_promo_mmk, price_paid_mmk, promo_applied, promo_percent')
    .single()

  if (updateErr || !data) {
    console.error('admin-confirm-b2b update error:', updateErr)
    return json({ error: 'Subscription not found or not in PENDING state' }, 404)
  }

  const resendApi = Deno.env.get('RESEND_API_KEY')
  if (action === 'confirm' && resendApi) {
    try {
      const durationMonths = [3, 6, 12].includes(Number(data.duration_months)) ? Number(data.duration_months) : 12
      const validUntilIso = typeof data.valid_until === 'string' ? data.valid_until : null

      const resend = new Resend(resendApi)
      const appUrl = getAppBaseUrl()
      const appOrigin = new URL(appUrl).origin
      const taxPercent = getInvoiceCommercialTaxPercent()
      const totalPaidMmk = Number(data.price_paid_mmk ?? 0) > 0
        ? Number(data.price_paid_mmk)
        : Number(data.price_list_mmk ?? 120000)
      const listPriceMmk = Number(data.price_list_mmk ?? totalPaidMmk)
      const promoPriceMmk = Number(data.price_promo_mmk ?? totalPaidMmk)
      const promoApplied = Boolean(data.promo_applied)
      const promoPercent = Number(data.promo_percent ?? 0)
      const { subtotalMmk, taxMmk, totalMmk } = splitTaxInclusiveTotalMmk(totalPaidMmk, taxPercent)

      const cust = await service.auth.admin.getUserById(data.user_id)
      const customerEmail = cust.data.user?.email

      let invoiceNumber: string | null = null
      if (customerEmail) {
        const { data: invNum, error: invNumErr } = await service.rpc('allocate_invoice_number')
        if (invNumErr) console.error('allocate_invoice_number error:', invNumErr)
        if (typeof invNum === 'string' && !invNumErr) invoiceNumber = invNum
      }

      const esc = (s: string) => escapeHtml(String(s ?? ''))
      const planLabel = data.plan_type === 'national_view' ? 'National view' : 'Fleet route access'
      const validThrough = new Date(validUntilIso ?? new Date().toISOString()).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Yangon',
      })
      const lineDescPlain =
        `${durationMonths}-month ${planLabel} — FuelBot subscription (access valid through ${validThrough})`
      const lineDescriptionHtml = esc(lineDescPlain)

      const meta = cust.data.user?.user_metadata as Record<string, unknown> | undefined
      const displayName =
        [meta?.full_name, meta?.name].find((v) => typeof v === 'string' && String(v).trim())?.toString().trim() ??
        ''

      if (invoiceNumber && customerEmail) {
        const { error: invInsErr } = await service.from('invoices').insert({
          invoice_number: invoiceNumber,
          kind: 'b2b_route_access',
          customer_user_id: data.user_id,
          b2b_subscription_id: data.id,
          line_description: `${lineDescPlain}${promoApplied ? ` [promo applied: ${promoPercent}% off, saved ${(Math.max(0, listPriceMmk - promoPriceMmk)).toLocaleString('en-US')} MMK]` : ''}`,
          subtotal_mmk: subtotalMmk,
          tax_rate_percent: taxPercent,
          tax_mmk: taxMmk,
          total_mmk: totalMmk,
          payment_method: data.payment_method ?? null,
          payment_reference: data.payment_reference ?? null,
        })
        if (invInsErr) {
          console.error('invoices insert error:', invInsErr)
        }

        if (!invInsErr) {
          const savingsMmk = Math.max(0, listPriceMmk - totalPaidMmk)
          const promoSummary = promoApplied && savingsMmk > 0
            ? `Promo savings: ${savingsMmk.toLocaleString('en-US')} MMK (${promoPercent}% off from list price).`
            : 'This subscription used standard list pricing.'
          const thankYou =
            `Thank you for choosing FuelBot. Your ${durationMonths}-month plan is now active and your invoice is attached below. ${promoSummary}`

          const html = buildInvoiceEmailHtml({
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
            billToName: esc(displayName || customerEmail),
            billToEmail: escapeHtml(customerEmail),
            lineDescription: lineDescriptionHtml,
            taxPercent,
            subtotalMmk,
            taxMmk,
            totalMmk,
            paymentMethod: data.payment_method,
            paymentReference: data.payment_reference,
            thankYouMessage: escapeHtml(thankYou),
          })

          await resend.emails.send({
            from: RESEND_FROM,
            to: [customerEmail],
            subject: `FuelBot — Invoice ${invoiceNumber} · Route access active`,
            html,
          })
        } else if (customerEmail) {
          await resend.emails.send({
            from: RESEND_FROM,
            to: [customerEmail],
            subject: 'FuelBot: route access confirmed',
            html:
              emailLogoHtml(appUrl) +
              `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:16px;color:#334155">
            <h2 style="color:#0f172a">Subscription active</h2>
            <p>Your payment has been confirmed. We could not attach your invoice automatically—please contact ${escapeHtml(getInvoiceSupportEmail())} and reference your payment.</p>
            <p><a href="${escapeHtml(appUrl + '/home')}" style="color:#1d4ed8">Open FuelBot</a></p>
          </div>`,
          })
        }
      } else if (customerEmail) {
        await resend.emails.send({
          from: RESEND_FROM,
          to: [customerEmail],
          subject: 'FuelBot: route access confirmed',
          html:
            emailLogoHtml(appUrl) +
            `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:16px;color:#334155">
            <h2 style="color:#0f172a">Subscription active</h2>
            <p>Your FuelBot fleet / route access payment has been confirmed. You can use route filters on the home screen.</p>
            <p><a href="${escapeHtml(appUrl + '/home')}" style="color:#1d4ed8">Open FuelBot</a></p>
          </div>`,
        })
      }
    } catch (notifyErr) {
      console.error('admin-confirm-b2b notify error:', notifyErr)
    }
  }

  return json({ success: true, subscription: data })
})
