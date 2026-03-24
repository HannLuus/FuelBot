import { escapeHtml } from './adminAuth.ts'

/**
 * Tax-inclusive breakdown: total charged includes Commercial Tax.
 * subtotal = round(total / (1 + rate)); tax = total - subtotal
 */
export function splitTaxInclusiveTotalMmk(totalMmk: number, taxPercent: number): {
  subtotalMmk: number
  taxMmk: number
  totalMmk: number
} {
  const rate = taxPercent / 100
  if (totalMmk <= 0 || rate < 0) {
    return { subtotalMmk: 0, taxMmk: 0, totalMmk: Math.max(0, Math.round(totalMmk)) }
  }
  const subtotalMmk = Math.round(totalMmk / (1 + rate))
  const taxMmk = totalMmk - subtotalMmk
  return { subtotalMmk, taxMmk, totalMmk }
}

export function getInvoiceCommercialTaxPercent(): number {
  const raw = Deno.env.get('INVOICE_COMMERCIAL_TAX_PERCENT')?.trim()
  const n = raw ? Number(raw) : 5
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 5
}

export function getInvoiceSupportEmail(): string {
  return Deno.env.get('INVOICE_SUPPORT_EMAIL')?.trim() || 'support@fuelbotmm.com'
}

export function getInvoiceCompanyName(): string {
  return Deno.env.get('INVOICE_COMPANY_NAME')?.trim() || 'FuelBot'
}

export function formatMmkEmail(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} MMK`
}

export interface InvoiceEmailFields {
  appOrigin: string
  invoiceNumber: string
  issuedDateLabel: string
  companyName: string
  supportEmail: string
  billToName: string
  billToEmail: string
  lineDescription: string
  taxPercent: number
  subtotalMmk: number
  taxMmk: number
  totalMmk: number
  paymentMethod?: string | null
  paymentReference?: string | null
  thankYouMessage: string
}

/**
 * Professional, table-based HTML for email clients. Caller must escape untrusted strings.
 */
export function buildInvoiceEmailHtml(f: InvoiceEmailFields): string {
  const taxLabel = `Commercial Tax (Myanmar CT, ${f.taxPercent}% inclusive)`
  const payRef = escapeHtml(f.paymentReference?.trim() || '—')
  const payMethod = escapeHtml(f.paymentMethod?.trim() || '—')

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f6fb;margin:0;padding:24px 12px;font-family:Georgia,'Times New Roman',serif">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(15,23,42,0.06)">
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)">
            <img src="${f.appOrigin}/FuelbotLogo.png" alt="FuelBot" width="128" height="auto" style="display:block;height:auto;margin-bottom:16px" />
            <p style="margin:0;font-size:13px;color:#334155;line-height:1.5">
              <strong style="color:#0f172a;font-size:15px">${f.companyName}</strong><br />
              <a href="mailto:${f.supportEmail}" style="color:#1d4ed8;text-decoration:none">${f.supportEmail}</a><br />
              <a href="${f.appOrigin}" style="color:#64748b;text-decoration:none">${f.appOrigin.replace(/^https?:\/\//, '')}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <table width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:top">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">Tax invoice</p>
                  <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.25">Invoice ${escapeHtml(f.invoiceNumber)}</h1>
                  <p style="margin:8px 0 0;font-size:13px;color:#475569">Issued: ${f.issuedDateLabel}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px">
              <tr>
                <td style="width:50%;vertical-align:top;padding-right:12px">
                  <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b">Bill to</p>
                  <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600">${f.billToName}</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#475569"><a href="mailto:${f.billToEmail}" style="color:#1d4ed8;text-decoration:none">${f.billToEmail}</a></p>
                </td>
                <td style="width:50%;vertical-align:top;padding-left:12px">
                  <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b">Payment</p>
                  <p style="margin:0;font-size:13px;color:#334155">Method: ${payMethod}</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#334155">Reference: ${payRef}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
              <tr style="background:#f1f5f9">
                <td style="padding:10px 14px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#475569">Description</td>
                <td align="right" style="padding:10px 14px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#475569;width:120px">Amount</td>
              </tr>
              <tr>
                <td style="padding:14px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0">${f.lineDescription}</td>
                <td align="right" style="padding:14px;font-size:14px;color:#0f172a;font-weight:600;border-top:1px solid #e2e8f0">${formatMmkEmail(f.totalMmk)}</td>
              </tr>
            </table>

            <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;max-width:320px;margin-left:auto">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b">Subtotal (excl. CT)</td>
                <td align="right" style="padding:6px 0;font-size:13px;color:#334155">${formatMmkEmail(f.subtotalMmk)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b">${taxLabel}</td>
                <td align="right" style="padding:6px 0;font-size:13px;color:#334155">${formatMmkEmail(f.taxMmk)}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top:2px solid #0f172a;padding-top:12px;margin-top:8px"></td>
              </tr>
              <tr>
                <td style="padding:4px 0 0;font-size:15px;font-weight:700;color:#0f172a">Total paid (inclusive)</td>
                <td align="right" style="padding:4px 0 0;font-size:15px;font-weight:700;color:#1d4ed8">${formatMmkEmail(f.totalMmk)}</td>
              </tr>
            </table>

            <p style="margin:28px 0 0;font-size:14px;color:#334155;line-height:1.65">
              ${f.thankYouMessage}
            </p>

            <p style="margin:20px 0 0;padding:14px 16px;background:#f8fafc;border-radius:8px;font-size:11px;color:#64748b;line-height:1.55">
              <strong style="color:#475569">Tax note:</strong> Amounts show Myanmar Commercial Tax (CT) at <strong>${f.taxPercent}%</strong> on a <strong>tax-inclusive</strong> basis, using the general services rate commonly applied in Myanmar (Union Tax Laws change; some supplies may use other rates). This invoice is for your records only and is not personal tax or legal advice—consult a qualified advisor for your situation.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;background:#f8fafc;border-top:1px solid #e2e8f0">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">
              © ${new Date().getUTCFullYear()} ${f.companyName} · Questions? <a href="mailto:${f.supportEmail}" style="color:#1d4ed8">${f.supportEmail}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}
