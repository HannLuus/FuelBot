import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@2.0.0'
import { corsHeaders, escapeHtml, json } from '../_shared/adminAuth.ts'
import { emailLogoHtml, getAppBaseUrl, RESEND_FROM } from '../_shared/emailHeader.ts'

const CONTACT_SCREENSHOT_BUCKET = 'contact-attachments'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

interface Payload {
  name?: string
  email?: string
  subject?: string
  message?: string
  screenshot_base64?: string | null
  screenshot_mime_type?: string | null
  screenshot_filename?: string | null
  locale?: string | null
  page?: string | null
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function inferExt(mimeType: string): 'jpg' | 'png' | 'webp' | 'gif' {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  return 'jpg'
}

function decodeBase64(base64: string): Uint8Array {
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload: Payload
  try {
    payload = await req.json() as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const name = String(payload.name ?? '').trim()
  const email = String(payload.email ?? '').trim().toLowerCase()
  const subject = String(payload.subject ?? '').trim()
  const message = String(payload.message ?? '').trim()
  const locale = String(payload.locale ?? 'en').trim().slice(0, 10)
  const page = String(payload.page ?? 'landing').trim().slice(0, 50)

  if (!name || !email || !subject || !message) {
    return json({ error: 'name, email, subject, and message are required' }, 400)
  }
  if (!isValidEmail(email)) return json({ error: 'Invalid email address' }, 400)
  if (name.length > 120 || subject.length > 180 || message.length > 5000) {
    return json({ error: 'Input is too long' }, 400)
  }

  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? Deno.env.get('ADMIN_EMAIL')
  if (!adminEmail) return json({ error: 'Admin contact email is not configured' }, 500)

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let screenshotPath: string | null = null
  let screenshotSignedUrl: string | null = null
  const screenshotBase64 = payload.screenshot_base64?.trim() || null
  const screenshotMime = payload.screenshot_mime_type?.trim() || null
  const screenshotFilename = payload.screenshot_filename?.trim() || null
  if (screenshotBase64) {
    if (!screenshotMime || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(screenshotMime)) {
      return json({ error: 'Unsupported screenshot type' }, 400)
    }
    let bytes: Uint8Array
    try {
      bytes = decodeBase64(screenshotBase64)
    } catch {
      return json({ error: 'Invalid screenshot encoding' }, 400)
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return json({ error: 'Screenshot exceeds 5 MB limit' }, 400)
    }
    const ext = inferExt(screenshotMime)
    const path = `public/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await service.storage.from(CONTACT_SCREENSHOT_BUCKET).upload(path, bytes, {
      contentType: screenshotMime,
      upsert: false,
    })
    if (upErr) {
      console.error('contact-us screenshot upload error:', upErr)
      return json({ error: 'Failed to upload screenshot' }, 500)
    }
    screenshotPath = path
    const { data: signed } = await service.storage.from(CONTACT_SCREENSHOT_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 14)
    screenshotSignedUrl = signed?.signedUrl ?? null
  }

  const { error: insertErr } = await service.from('contact_messages').insert({
    sender_name: name,
    sender_email: email,
    subject,
    message_body: message,
    screenshot_path: screenshotPath,
    screenshot_filename: screenshotFilename,
    locale,
    source_page: page,
  })
  if (insertErr) {
    console.error('contact-us insert error:', insertErr)
    return json({ error: 'Failed to save message' }, 500)
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ success: true, queued: true })

  try {
    const resend = new Resend(resendKey)
    const appUrl = getAppBaseUrl()
    await resend.emails.send({
      from: RESEND_FROM,
      to: [adminEmail],
      subject: `FuelBot contact: ${subject}`,
      reply_to: email,
      html: emailLogoHtml(appUrl) + `
        <h2 style="margin:0 0 12px 0;color:#0f172a">New Contact Message</h2>
        <p style="margin:0 0 8px 0"><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p style="margin:0 0 8px 0"><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p style="margin:0 0 8px 0"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p style="margin:0 0 8px 0"><strong>Language:</strong> ${escapeHtml(locale || 'en')}</p>
        <p style="margin:0 0 8px 0"><strong>Source page:</strong> ${escapeHtml(page)}</p>
        <div style="margin:12px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px;color:#334155;white-space:pre-wrap">${escapeHtml(message)}</div>
        ${screenshotSignedUrl ? `<p style="margin:12px 0 0 0"><strong>Screenshot:</strong> <a href="${escapeHtml(screenshotSignedUrl)}">Open uploaded screenshot</a></p>` : ''}
      `,
    })
  } catch (notifyErr) {
    console.error('contact-us notify error:', notifyErr)
    // Message is already stored, so we still return success.
  }

  return json({ success: true })
})

