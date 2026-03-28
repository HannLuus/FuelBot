/**
 * Supabase Auth — Send Email hook handler.
 *
 * When this hook is enabled (Dashboard → Authentication → Hooks → Send Email),
 * Supabase stops using SMTP for auth mail and POSTs here instead. The handler
 * MUST send to `user.email` (the account owner). Sending to ADMIN_* env vars
 * would incorrectly deliver customer reset links to staff.
 *
 * Deploy: supabase functions deploy auth-send-email --no-verify-jwt
 * Secrets: RESEND_API_KEY, SEND_EMAIL_HOOK_SECRET (from hook “Generate secret”)
 */
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { Resend } from 'npm:resend@2.0.0'
import { escapeHtml } from '../_shared/adminAuth.ts'
import { RESEND_FROM } from '../_shared/emailHeader.ts'

interface HookUser {
  email: string
  new_email?: string
}

interface HookEmailData {
  token: string
  token_hash: string
  redirect_to: string
  email_action_type: string
  site_url: string
  token_new: string
  token_hash_new: string
  new_email?: string
}

function normalizeHookSecret(raw: string): string {
  if (raw.startsWith('v1,whsec_')) return raw.slice('v1,whsec_'.length)
  if (raw.startsWith('whsec_')) return raw.slice('whsec_'.length)
  return raw
}

function verifyLink(
  supabaseUrl: string,
  tokenHash: string,
  type: string,
  redirectTo: string,
): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const q = new URLSearchParams({
    token_hash: tokenHash,
    type,
    redirect_to: redirectTo || '',
  })
  return `${base}/auth/v1/verify?${q.toString()}`
}

/** Maps Auth hook action to GoTrue /verify `type` query param. */
function verifyTypeParam(emailActionType: string): string | null {
  switch (emailActionType) {
    case 'recovery':
      return 'recovery'
    case 'signup':
      return 'signup'
    case 'invite':
      return 'invite'
    case 'email_change':
      return 'email_change'
    case 'magiclink':
    case 'email':
      return 'email'
    case 'reauthentication':
      return null
    default:
      if (emailActionType.endsWith('_notification')) return null
      return 'email'
  }
}

function subjectForAction(emailActionType: string): string {
  switch (emailActionType) {
    case 'recovery':
      return 'Reset your FuelBot password'
    case 'signup':
      return 'Welcome to FuelBot — confirm your email'
    case 'invite':
      return 'You are invited to FuelBot'
    case 'magiclink':
    case 'email':
      return 'Your FuelBot sign-in link'
    case 'email_change':
      return 'Confirm your FuelBot email change'
    case 'reauthentication':
      return 'Your FuelBot verification code'
    default:
      if (emailActionType === 'password_changed_notification') return 'Your FuelBot password was changed'
      return 'FuelBot account notification'
  }
}

function buildHtml(params: {
  emailActionType: string
  link: string | null
  token: string
  siteUrl: string
}): string {
  const { emailActionType, link, token, siteUrl } = params
  const safeSite = escapeHtml(siteUrl)
  const code = token && /^\d{6}$/.test(token) ? `<p style="font-size:18px;font-weight:bold;letter-spacing:0.2em">${escapeHtml(token)}</p>` : ''

  if (emailActionType === 'reauthentication') {
    return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
      <h1 style="font-size:20px">Verification code</h1>
      <p>Enter this code in the app:</p>
      ${code}
      <p style="font-size:14px;color:#64748b">If you did not request this, you can ignore this email.</p>
      <p style="font-size:12px;color:#94a3b8">${safeSite}</p>
    </body></html>`
  }

  if (emailActionType.endsWith('_notification')) {
    return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
      <p>This is an automated security notification for your FuelBot account.</p>
      <p style="font-size:12px;color:#94a3b8">${safeSite}</p>
    </body></html>`
  }

  const button = link
    ? `<p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Continue</a></p>
       <p style="font-size:13px;color:#64748b">Or copy this link:<br/>${escapeHtml(link)}</p>`
    : ''

  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
    <h1 style="font-size:20px">${escapeHtml(subjectForAction(emailActionType))}</h1>
    ${button}
    ${code ? `<p style="margin-top:16px">Or use this code:</p>${code}` : ''}
    <p style="font-size:14px;color:#64748b;margin-top:24px">If you did not request this email, you can ignore it.</p>
    <p style="font-size:12px;color:#94a3b8">${safeSite}</p>
  </body></html>`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const hookSecretRaw = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  if (!hookSecretRaw || !resendKey || !supabaseUrl) {
    console.error('auth-send-email: missing SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY, or SUPABASE_URL')
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const payloadText = await req.text()
  const headers = Object.fromEntries(req.headers)

  let user: HookUser
  let email_data: HookEmailData

  try {
    const wh = new Webhook(normalizeHookSecret(hookSecretRaw))
    const parsed = wh.verify(payloadText, headers) as { user: HookUser; email_data: HookEmailData }
    user = parsed.user
    email_data = parsed.email_data
  } catch (e) {
    console.error('auth-send-email: webhook verify failed', e)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const to = user.email?.trim()
  if (!to) {
    return new Response(JSON.stringify({ error: 'Missing user email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const {
    token,
    token_hash,
    redirect_to,
    email_action_type,
    site_url,
    token_new,
    token_hash_new,
  } = email_data

  const resend = new Resend(resendKey)

  // Secure email change: two messages (current + new address). See Supabase Send Email Hook docs.
  if (email_action_type === 'email_change' && token_new && token_hash && token_hash_new) {
    const newEmail = user.new_email?.trim() || email_data.new_email?.trim()
    if (!newEmail) {
      console.error('auth-send-email: email_change missing user.new_email')
      return new Response(JSON.stringify({ error: 'Invalid email_change payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const linkCurrent = verifyLink(supabaseUrl, token_hash_new, 'email_change', redirect_to)
    const linkNew = verifyLink(supabaseUrl, token_hash, 'email_change', redirect_to)

    const r1 = await resend.emails.send({
      from: RESEND_FROM,
      to: [to],
      subject: 'Confirm email change on your FuelBot account',
      html: buildHtml({
        emailActionType: 'email_change',
        link: linkCurrent,
        token,
        siteUrl: site_url,
      }),
    })
    if (r1.error) {
      console.error('auth-send-email: resend (current email)', r1.error)
      return new Response(JSON.stringify({ error: 'Send failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const r2 = await resend.emails.send({
      from: RESEND_FROM,
      to: [newEmail],
      subject: 'Confirm your new FuelBot email',
      html: buildHtml({
        emailActionType: 'email_change',
        link: linkNew,
        token: token_new,
        siteUrl: site_url,
      }),
    })
    if (r2.error) {
      console.error('auth-send-email: resend (new email)', r2.error)
      return new Response(JSON.stringify({ error: 'Send failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const vType = verifyTypeParam(email_action_type)
  const link =
    vType && token_hash
      ? verifyLink(supabaseUrl, token_hash, vType, redirect_to)
      : null

  const { error } = await resend.emails.send({
    from: RESEND_FROM,
    to: [to],
    subject: subjectForAction(email_action_type),
    html: buildHtml({
      emailActionType: email_action_type,
      link,
      token,
      siteUrl: site_url,
    }),
  })

  if (error) {
    console.error('auth-send-email: resend error', error)
    return new Response(JSON.stringify({ error: 'Send failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
