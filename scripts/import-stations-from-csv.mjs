#!/usr/bin/env node
/**
 * Import fuel stations from CSV into Supabase.
 * Default: data/SCRAPE1.csv (source of truth with verified lat/lng).
 * Override: IMPORT_CSV=path/to/file.csv
 *
 * Before import, deletes all existing station_status_reports and stations
 * (child tables referral_rewards, station_location_reports, station_status_snapshots
 * are removed by CASCADE when stations are deleted).
 *
 * Requires: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 * Run: npm run import-stations
 * Or:  IMPORT_CSV=data/other.csv npm run import-stations
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
dotenv.config({ path: resolve(root, '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CSV_PATH = process.env.IMPORT_CSV
  ? resolve(root, process.env.IMPORT_CSV)
  : resolve(root, 'data', 'SCRAPE1.csv')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Parse a single CSV line respecting quoted fields (and "" inside quotes)
function parseCsvLine(line) {
  const out = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let s = ''
      i++
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            s += '"'
            i += 2
          } else {
            i++
            break
          }
        } else {
          s += line[i++]
        }
      }
      out.push(s)
      if (line[i] === ',') i++
    } else {
      let s = ''
      while (i < line.length && line[i] !== ',') s += line[i++]
      out.push(s)
      if (line[i] === ',') i++
    }
  }
  return out
}

function parseBool(v) {
  if (v === undefined || v === null || v === '') return false
  const s = String(v).trim()
  if (s === 'True' || s === 'true' || s === '1') return true
  if (s === 'False' || s === 'false' || s === 'None' || s === '0') return false
  return false
}

function emptyToNull(s) {
  if (s === undefined || s === null) return null
  const t = String(s).trim()
  return t === '' || t === 'None' ? null : t
}

function parseWorkingHoursJson(s) {
  if (!s || String(s).trim() === '' || String(s).trim() === 'None') return null
  try {
    const parsed = JSON.parse(String(s))
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error('CSV not found:', CSV_PATH)
    process.exit(1)
  }

  let raw = readFileSync(CSV_PATH, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  const lines = []
  let inQuotes = false
  let current = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '"') {
      inQuotes = !inQuotes
      current += c
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && raw[i + 1] === '\n') i++
      if (current.trim().length > 0) lines.push(current)
      current = ''
    } else {
      current += c
    }
  }
  if (current.trim().length > 0) lines.push(current)
  if (lines.length < 2) {
    console.error('CSV has no data rows')
    process.exit(1)
  }

  const header = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((l) => parseCsvLine(l))

  const col = (row, name) => {
    const i = header.indexOf(name)
    return i === -1 ? undefined : row[i]
  }

  console.log('Clearing existing station data...')
  const BATCH = 500

  const { data: reports } = await supabase
    .from('station_status_reports')
    .select('id')
    .limit(1)
  const hasReports = reports && reports.length > 0
  if (hasReports) {
    let deleted = 0
    for (;;) {
      const { data: ids } = await supabase
        .from('station_status_reports')
        .select('id')
        .limit(BATCH)
      if (!ids?.length) break
      const { error } = await supabase
        .from('station_status_reports')
        .delete()
        .in('id', ids.map((r) => r.id))
      if (error) {
        console.error('Error deleting station_status_reports:', error.message)
        process.exit(1)
      }
      deleted += ids.length
      process.stdout.write(`  Deleted ${deleted} station_status_reports\r`)
    }
    console.log('  Deleted all station_status_reports.')
  }

  let stationCount = 0
  for (;;) {
    const { data: stations } = await supabase
      .from('stations')
      .select('id')
      .gte('created_at', '1970-01-01')
      .limit(BATCH)
    if (!stations?.length) break
    const { error } = await supabase
      .from('stations')
      .delete()
      .in('id', stations.map((s) => s.id))
    if (error) {
      console.error('Error deleting stations:', error.message)
      process.exit(1)
    }
    stationCount += stations.length
    process.stdout.write(`  Deleted ${stationCount} stations\r`)
  }
  console.log(`  Deleted ${stationCount} stations.`)

  console.log('Importing from', CSV_PATH, '...')
  const now = new Date().toISOString()
  const inserts = []
  for (const row of rows) {
    const lat = parseFloat(col(row, 'latitude'))
    const lng = parseFloat(col(row, 'longitude'))
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue
    const name = emptyToNull(col(row, 'name')) || 'Unnamed'
    const address = emptyToNull(col(row, 'address'))
    const city = emptyToNull(col(row, 'city')) || ''
    const street = emptyToNull(col(row, 'street'))
    const township = street || ''
    const verified = parseBool(col(row, 'verified'))
    const workingHours = parseWorkingHoursJson(col(row, 'working_hours'))
    inserts.push({
      id: randomUUID(),
      name,
      name_for_emails: emptyToNull(col(row, 'name_for_emails')),
      phone: emptyToNull(col(row, 'phone')),
      website: emptyToNull(col(row, 'website')),
      working_hours: workingHours,
      owner_title: emptyToNull(col(row, 'owner_title')),
      brand: emptyToNull(col(row, 'owner_title')),
      lat,
      lng,
      address_text: address,
      township,
      city,
      country_code: 'MM',
      is_verified: verified,
      verification_source: 'distributor',
      is_active: true,
      created_at: now,
      updated_at: now,
    })
  }

  let imported = 0
  for (let i = 0; i < inserts.length; i += BATCH) {
    const chunk = inserts.slice(i, i + BATCH)
    const { error } = await supabase.from('stations').insert(chunk)
    if (error) {
      console.error('Insert error:', error.message)
      process.exit(1)
    }
    imported += chunk.length
    process.stdout.write(`  Inserted ${imported}/${inserts.length}\r`)
  }
  console.log(`\nDone. Imported ${imported} stations.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
