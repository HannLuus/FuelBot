import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@2.0.0'
import { escapeHtml, json } from '../_shared/adminAuth.ts'
import { emailLogoHtml, getAppAdminUrl, getAppBaseUrl, RESEND_FROM } from '../_shared/emailHeader.ts'

interface DayWindow {
  startIso: string
  endIso: string
  label: string
}

interface MetricRow {
  label: string
  today: number
  yesterday: number
}

function parseTimezoneOffsetMinutes(raw: string | undefined): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 390
  return Math.max(-720, Math.min(840, Math.trunc(parsed)))
}

function dayWindowFromOffset(offsetMinutes: number, daysAgo: number): DayWindow {
  const offsetMs = offsetMinutes * 60_000
  const local = new Date(Date.now() + offsetMs)
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() - daysAgo)
  const startUtcMs = local.getTime() - offsetMs
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000

  const labelDate = new Date(startUtcMs + offsetMs)
  const yyyy = labelDate.getUTCFullYear()
  const mm = String(labelDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(labelDate.getUTCDate()).padStart(2, '0')

  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
    label: `${yyyy}-${mm}-${dd}`,
  }
}

function pctText(today: number, yesterday: number): string {
  if (yesterday === 0) return today > 0 ? '+100%' : '0%'
  const raw = ((today - yesterday) / yesterday) * 100
  const rounded = Math.round(raw)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}

function trendColor(today: number, yesterday: number): string {
  if (today > yesterday) return '#166534'
  if (today < yesterday) return '#b91c1c'
  return '#475569'
}

function metricTable(rows: MetricRow[]): string {
  const body = rows.map((row) => {
    const delta = row.today - row.yesterday
    const deltaSign = delta > 0 ? '+' : ''
    return `<tr>
      <td style="padding:10px;border-top:1px solid #e2e8f0;color:#0f172a">${escapeHtml(row.label)}</td>
      <td style="padding:10px;border-top:1px solid #e2e8f0;text-align:right;color:#0f172a">${row.today.toLocaleString('en-US')}</td>
      <td style="padding:10px;border-top:1px solid #e2e8f0;text-align:right;color:#334155">${row.yesterday.toLocaleString('en-US')}</td>
      <td style="padding:10px;border-top:1px solid #e2e8f0;text-align:right;color:${trendColor(row.today, row.yesterday)}"><strong>${pctText(row.today, row.yesterday)}</strong> <span style="color:#64748b">(${deltaSign}${delta})</span></td>
    </tr>`
  }).join('')

  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 18px">
    <thead>
      <tr>
        <th style="text-align:left;padding:10px;background:#f8fafc;color:#0f172a">Metric</th>
        <th style="text-align:right;padding:10px;background:#f8fafc;color:#0f172a">Today</th>
        <th style="text-align:right;padding:10px;background:#f8fafc;color:#0f172a">Yesterday</th>
        <th style="text-align:right;padding:10px;background:#f8fafc;color:#0f172a">Growth</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`
}

async function countByWindow(
  service: ReturnType<typeof createClient>,
  table: string,
  column: string,
  window: DayWindow,
): Promise<number> {
  const { count, error } = await service
    .from(table)
    .select('*', { count: 'exact', head: true })
    .gte(column, window.startIso)
    .lt(column, window.endIso)

  if (error) throw new Error(`${table} count failed: ${error.message}`)
  return Number(count ?? 0)
}

async function countAuthByWindow(
  service: ReturnType<typeof createClient>,
  column: 'created_at' | 'last_sign_in_at',
  window: DayWindow,
): Promise<number> {
  const { count, error } = await service
    .schema('auth')
    .from('users')
    .select('*', { count: 'exact', head: true })
    .gte(column, window.startIso)
    .lt(column, window.endIso)

  if (error) throw new Error(`auth.users ${column} count failed: ${error.message}`)
  return Number(count ?? 0)
}

async function countAdminUsers(service: ReturnType<typeof createClient>): Promise<number> {
  const { count, error } = await service
    .from('admin_users')
    .select('*', { count: 'exact', head: true })
  if (error) throw new Error(`admin_users count failed: ${error.message}`)
  return Number(count ?? 0)
}

async function distinctCount(
  service: ReturnType<typeof createClient>,
  table: string,
  column: string,
): Promise<number> {
  const query = service.from(table).select(column).not(column, 'is', null)
  const { data, error } = await query
  if (error) throw new Error(`${table} distinct ${column} failed: ${error.message}`)
  const set = new Set<string>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const v = row[column]
    if (typeof v === 'string' && v.trim()) set.add(v)
  }
  return set.size
}

async function distinctFleetUsers(service: ReturnType<typeof createClient>): Promise<number> {
  const { data, error } = await service
    .from('b2b_subscriptions')
    .select('user_id')
    .eq('status', 'CONFIRMED')
    .gt('valid_until', new Date().toISOString())
    .not('user_id', 'is', null)

  if (error) throw new Error(`b2b_subscriptions fleet users failed: ${error.message}`)
  const set = new Set<string>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const v = row.user_id
    if (typeof v === 'string' && v.trim()) set.add(v)
  }
  return set.size
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  const provided = req.headers.get('x-cron-secret')
  if (!cronSecret || provided !== cronSecret) {
    return json({ error: 'Forbidden' }, 403)
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? Deno.env.get('ADMIN_EMAIL')
  if (!resendKey || !adminEmail) {
    return json({ error: 'Missing RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL/ADMIN_EMAIL' }, 500)
  }

  const timezoneOffset = parseTimezoneOffsetMinutes(Deno.env.get('REPORT_TIMEZONE_OFFSET_MINUTES'))
  const today = dayWindowFromOffset(timezoneOffset, 0)
  const yesterday = dayWindowFromOffset(timezoneOffset, 1)

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const [
      signupsToday,
      signupsYesterday,
      activeUsersToday,
      activeUsersYesterday,
      reportsToday,
      reportsYesterday,
      locationToday,
      locationYesterday,
      suggestionsToday,
      suggestionsYesterday,
      claimsToday,
      claimsYesterday,
      stationPaymentsToday,
      stationPaymentsYesterday,
      b2bPendingToday,
      b2bPendingYesterday,
      pendingClaimsNow,
      pendingB2BNow,
      pendingStationsNow,
      totalUsers,
      admins,
      stationOwners,
      fleetUsers,
    ] = await Promise.all([
      countAuthByWindow(service, 'created_at', today),
      countAuthByWindow(service, 'created_at', yesterday),
      countAuthByWindow(service, 'last_sign_in_at', today),
      countAuthByWindow(service, 'last_sign_in_at', yesterday),
      countByWindow(service, 'station_status_reports', 'reported_at', today),
      countByWindow(service, 'station_status_reports', 'reported_at', yesterday),
      countByWindow(service, 'station_location_reports', 'created_at', today),
      countByWindow(service, 'station_location_reports', 'created_at', yesterday),
      countByWindow(service, 'station_suggestions', 'created_at', today),
      countByWindow(service, 'station_suggestions', 'created_at', yesterday),
      countByWindow(service, 'station_claims', 'created_at', today),
      countByWindow(service, 'station_claims', 'created_at', yesterday),
      countByWindow(service, 'stations', 'payment_reported_at', today),
      countByWindow(service, 'stations', 'payment_reported_at', yesterday),
      countByWindow(service, 'b2b_subscriptions', 'created_at', today),
      countByWindow(service, 'b2b_subscriptions', 'created_at', yesterday),
      (async () => {
        const { count, error } = await service.from('station_claims').select('*', { count: 'exact', head: true }).eq('status', 'PENDING')
        if (error) throw new Error(`pending station_claims failed: ${error.message}`)
        return Number(count ?? 0)
      })(),
      (async () => {
        const { count, error } = await service.from('b2b_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'PENDING')
        if (error) throw new Error(`pending b2b_subscriptions failed: ${error.message}`)
        return Number(count ?? 0)
      })(),
      (async () => {
        const { count, error } = await service
          .from('stations')
          .select('*', { count: 'exact', head: true })
          .not('verified_owner_id', 'is', null)
          .eq('is_verified', false)
          .is('registration_rejected_at', null)
        if (error) throw new Error(`pending stations failed: ${error.message}`)
        return Number(count ?? 0)
      })(),
      (async () => {
        const { count, error } = await service.schema('auth').from('users').select('*', { count: 'exact', head: true })
        if (error) throw new Error(`total users failed: ${error.message}`)
        return Number(count ?? 0)
      })(),
      countAdminUsers(service),
      distinctCount(service, 'stations', 'verified_owner_id'),
      distinctFleetUsers(service),
    ])

    const metricRows: MetricRow[] = [
      { label: 'New sign-ups', today: signupsToday, yesterday: signupsYesterday },
      { label: 'Active users (signed in)', today: activeUsersToday, yesterday: activeUsersYesterday },
      { label: 'Status reports submitted', today: reportsToday, yesterday: reportsYesterday },
      { label: 'Wrong-location reports', today: locationToday, yesterday: locationYesterday },
      { label: 'New station suggestions', today: suggestionsToday, yesterday: suggestionsYesterday },
      { label: 'Station claims submitted', today: claimsToday, yesterday: claimsYesterday },
      { label: 'Station payment reports', today: stationPaymentsToday, yesterday: stationPaymentsYesterday },
      { label: 'B2B payment requests', today: b2bPendingToday, yesterday: b2bPendingYesterday },
    ]

    const appBaseUrl = getAppBaseUrl()
    const appAdminUrl = getAppAdminUrl()
    const nowText = new Date().toISOString().replace('T', ' ').slice(0, 16)

    const html = emailLogoHtml(appBaseUrl) + `
      <div style="font-family:Georgia,serif;max-width:760px;margin:0 auto;padding:8px 16px;color:#334155">
        <h2 style="margin:0 0 8px;color:#0f172a">FuelBot daily executive report</h2>
        <p style="margin:0 0 14px;color:#475569">
          Window (timezone offset UTC${timezoneOffset >= 0 ? '+' : ''}${(timezoneOffset / 60).toFixed(1)}): today <strong>${today.label}</strong>, yesterday <strong>${yesterday.label}</strong>.
        </p>
        ${metricTable(metricRows)}

        <h3 style="margin:10px 0 6px;color:#0f172a">Current user mix</h3>
        <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
          <tr><td style="padding:8px;border-top:1px solid #e2e8f0">Total accounts</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:right">${totalUsers.toLocaleString('en-US')}</td></tr>
          <tr><td style="padding:8px;border-top:1px solid #e2e8f0">Admin users</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:right">${admins.toLocaleString('en-US')}</td></tr>
          <tr><td style="padding:8px;border-top:1px solid #e2e8f0">Station owner users (distinct)</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:right">${stationOwners.toLocaleString('en-US')}</td></tr>
          <tr><td style="padding:8px;border-top:1px solid #e2e8f0">Fleet users with active confirmed B2B access</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:right">${fleetUsers.toLocaleString('en-US')}</td></tr>
        </table>

        <h3 style="margin:10px 0 6px;color:#0f172a">Pending approvals now</h3>
        <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
          <tr><td style="padding:8px;border-top:1px solid #e2e8f0">Station registrations pending</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:right">${pendingStationsNow.toLocaleString('en-US')}</td></tr>
          <tr><td style="padding:8px;border-top:1px solid #e2e8f0">Station claims pending</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:right">${pendingClaimsNow.toLocaleString('en-US')}</td></tr>
          <tr><td style="padding:8px;border-top:1px solid #e2e8f0">B2B payments pending confirmation</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:right">${pendingB2BNow.toLocaleString('en-US')}</td></tr>
        </table>

        <p style="margin:0 0 10px"><a href="${escapeHtml(appAdminUrl)}" style="color:#1d4ed8">Open FuelBot admin panel</a></p>
        <p style="font-size:12px;color:#64748b;margin:0">Generated at ${escapeHtml(nowText)} UTC by daily-executive-report.</p>
      </div>
    `

    const resend = new Resend(resendKey)
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [adminEmail],
      subject: `FuelBot Daily Executive Report — ${today.label} vs ${yesterday.label}`,
      html,
    })

    if (error) {
      console.error('daily-executive-report send error:', error)
      return json({ error: 'Send failed' }, 500)
    }

    return json({
      success: true,
      window: { today: today.label, yesterday: yesterday.label, timezoneOffsetMinutes: timezoneOffset },
      recipients: [adminEmail],
    })
  } catch (err) {
    console.error('daily-executive-report failed:', err)
    return json({ error: 'Failed to generate report' }, 500)
  }
})
