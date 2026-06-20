import { corsHeaders, json, escapeHtml } from './_shared/adminAuth.ts';
import { getAppBaseUrl, RESEND_FROM } from './_shared/emailHeader.ts';
import { buildInvoiceEmailHtml, getInvoiceCommercialTaxPercent, getInvoiceCompanyName, getInvoiceSupportEmail, splitTaxInclusiveTotalMmk } from './_shared/invoiceHtml.ts';
import { Resend } from 'npm:resend@2.0.0';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response(null, {
    headers: corsHeaders()
  });
  const resendApi = Deno.env.get('RESEND_API_KEY');
  if (!resendApi) return json({
    error: 'RESEND_API_KEY is not configured'
  }, 500);
  const to = 'hann.luus@gmail.com';
  const appUrl = getAppBaseUrl();
  const appOrigin = new URL(appUrl).origin;
  const taxPercent = getInvoiceCommercialTaxPercent();
  const totalMmk = 120000;
  const { subtotalMmk, taxMmk } = splitTaxInclusiveTotalMmk(totalMmk, taxPercent);
  const invoiceNumber = `TEST-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const html = buildInvoiceEmailHtml({
    appOrigin,
    invoiceNumber,
    issuedDateLabel: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Yangon'
    }),
    companyName: escapeHtml(getInvoiceCompanyName()),
    supportEmail: escapeHtml(getInvoiceSupportEmail()),
    billToName: 'FuelBot Internal Test',
    billToEmail: to,
    lineDescription: 'TEST INVOICE — Annual station subscription (format preview only)',
    taxPercent,
    subtotalMmk,
    taxMmk,
    totalMmk,
    paymentMethod: 'KBZ_PAY',
    paymentReference: 'TEST-REF-0003',
    thankYouMessage: 'This is a test invoice email for layout preview. No payment action is required. If this format looks good, we will keep this style for all customer invoices.'
  });
  const resend = new Resend(resendApi);
  const { error } = await resend.emails.send({
    from: RESEND_FROM,
    to: [
      to
    ],
    subject: `FuelBot TEST invoice ${invoiceNumber}`,
    html
  });
  if (error) return json({
    error: error.message
  }, 500);
  return json({
    success: true,
    sent_to: to,
    invoice_number: invoiceNumber
  });
});
