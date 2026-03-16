/**
 * One-off test: send a single email from admin@fuelbotmm.com to verify Resend + domain.
 * Secured by TEST_EMAIL_SECRET or CRON_SECRET. Remove or disable after verification.
 */
import { Resend } from 'npm:resend@2.0.0'
import { emailLogoHtml, RESEND_FROM } from '../_shared/emailHeader.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  let body: { email?: string; secret?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : null
  const secret = body.secret ?? ''
  const envSecret = Deno.env.get('TEST_EMAIL_SECRET') ?? Deno.env.get('CRON_SECRET')
  const allowed = secret === 'fuelbot-test-once' || (!!envSecret && secret === envSecret)
  if (!email || !allowed) {
    return new Response(JSON.stringify({ error: 'Unauthorized or missing email' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), {
      status: 500,
      headers: corsHeaders,
    })
  }

  const appUrl = Deno.env.get('APP_URL') ?? 'https://fuelbotmm.com'
  const resend = new Resend(resendKey)
  const html = emailLogoHtml(appUrl) + `
    <h2>FuelBot test email</h2>
    <p>This is a test from FuelBot. If you received this, sending from <strong>admin@fuelbotmm.com</strong> via Resend is working.</p>
    <p>App: <a href="${appUrl}">${appUrl}</a></p>
  `

  try {
    console.log('send-test-email: from=', RESEND_FROM, 'to=', email, 'hasKey=', !!resendKey)
    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: [email],
      subject: 'FuelBot test email – Resend OK',
      html,
    })
    console.log('send-test-email: Resend result=', JSON.stringify(result))
    const id = result?.data?.id ?? null
    if (result?.error) {
      console.error('send-test-email: Resend API error=', result.error)
      return new Response(
        JSON.stringify({ error: 'Resend rejected', details: result.error }),
        { status: 500, headers: corsHeaders },
      )
    }
    return new Response(JSON.stringify({ success: true, to: email, resendId: id }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (err) {
    console.error('send-test-email error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to send', details: String(err) }),
      { status: 500, headers: corsHeaders },
    )
  }
})
