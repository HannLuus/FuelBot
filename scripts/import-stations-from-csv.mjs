#!/usr/bin/env node
/**
 * Import fuel stations from CSV into Supabase.
 *
 * Rows with empty lat/lng are imported as address-only (location = null). They are
 * not shown on the map (get_nearby_stations requires location IS NOT NULL). Only
 * rows with real coordinates get a map pin.
 *
 * Requires in .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run: npm run import-stations  (or IMPORT_CSV=verified-stations.csv for verified list)
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
dotenv.config({ path: resolve(root, '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const DATA_DIR = resolve(root, 'data')
const CSV_NAME =
  process.env.IMPORT_CSV ||
  (existsSync(resolve(DATA_DIR, 'stations-myanmar.csv')) ? 'stations-myanmar.csv' : 'stations-yangon-mandalay.csv')
const CSV_PATH = resolve(DATA_DIR, CSV_NAME)
const BATCH_SIZE = 50

/** Parse a single CSV line respecting quoted fields (handles commas inside "...") */
function parseCSVLine(line) {
  const out = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1
      const parts = []
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') {
            parts.push(line.slice(i + 1, end + 1))
            i = end + 1
            end = end + 2
            continue
          }
          parts.push(line.slice(i + 1, end))
          out.push(parts.join('').replace(/""/g, '"'))
          i = end + 1
          if (line[i] === ',') i++
          end = i
          break
        }
        end++
      }
      if (end >= line.length) {
        out.push(parts.join('').replace(/""/g, '"'))
        break
      }
      continue
    }
    const comma = line.indexOf(',', i)
    if (comma === -1) {
      out.push(line.slice(i).trim())
      break
    }
    out.push(line.slice(i, comma).trim())
    i = comma + 1
  }
  return out
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = parseCSVLine(lines[0])
  const nameIdx = header.indexOf('name')
  const brandIdx = header.indexOf('brand')
  const latIdx = header.indexOf('lat')
  const lngIdx = header.indexOf('lng')
  const addressIdx = header.indexOf('address_text')
  const townshipIdx = header.indexOf('township')
  const cityIdx = header.indexOf('city')
  const countryIdx = header.indexOf('country_code')
  if (
    nameIdx === -1 ||
    latIdx === -1 ||
    lngIdx === -1 ||
    townshipIdx === -1 ||
    cityIdx === -1 ||
    countryIdx === -1
  ) {
    throw new Error('CSV must have columns: name, brand, lat, lng, address_text, township, city, country_code (lat/lng may be empty for address-only rows)')
  }
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i])
    const name = (cells[nameIdx] ?? '').trim()
    if (!name) continue
    const latRaw = (cells[latIdx] ?? '').trim()
    const lngRaw = (cells[lngIdx] ?? '').trim()
    const lat = latRaw === '' ? null : Number(latRaw)
    const lng = lngRaw === '' ? null : Number(lngRaw)
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
    const brand = (cells[brandIdx] ?? '').trim() || null
    const address_text = (cells[addressIdx] ?? '').trim() || null
    const township = (cells[townshipIdx] ?? '').trim() || '—'
    const city = (cells[cityIdx] ?? '').trim() || 'Yangon'
    const country_code = (cells[countryIdx] ?? '').trim() || 'MM'
    rows.push({
      name,
      brand,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      address_text,
      township,
      city,
      country_code,
    })
  }
  return rows
}

function rowKey(r) {
  if (r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
    return `${r.name}|${Number(r.lat).toFixed(5)}|${Number(r.lng).toFixed(5)}|${r.city}`
  }
  return `${r.name}|${r.township}|${r.city}`
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`File not found: ${CSV_PATH}`)
    console.error('Run npm run source-stations first to generate the CSV.')
    process.exit(1)
  }

  const raw = readFileSync(CSV_PATH, 'utf8')
  const rows = parseCSV(raw)
  if (rows.length === 0) {
    console.error('No valid rows in CSV.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const isVerifiedImport = CSV_NAME === 'verified-stations.csv'

  const { data: existingRows } = await supabase.from('stations').select('id, name, lat, lng, township, city')
  const existingByKey = new Map()
  const existingByMatch = new Map() // (name, township, city) -> { id, ... } for verified update path
  for (const r of existingRows || []) {
    const key =
      r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng)
        ? `${r.name}|${Number(r.lat).toFixed(5)}|${Number(r.lng).toFixed(5)}|${r.city}`
        : `${r.name}|${r.township || ''}|${r.city}`
    existingByKey.set(key, r)
    const matchKey = `${r.name}|${(r.township || '').trim()}|${(r.city || '').trim()}`
    if (!existingByMatch.has(matchKey)) existingByMatch.set(matchKey, r)
  }

  let inserted = 0
  let updated = 0
  let failed = 0
  const toInsert = []

  if (isVerifiedImport) {
    // Update existing stations by (name, township, city) so re-import after de-dup clears duplicate pins
    for (const row of rows) {
      const matchKey = `${row.name}|${(row.township || '').trim()}|${(row.city || '').trim()}`
      const existing = existingByMatch.get(matchKey)
      if (existing) {
        const hasLoc =
          row.lat != null && row.lng != null && Number.isFinite(row.lat) && Number.isFinite(row.lng)
        const location =
          hasLoc ? { type: 'Point', coordinates: [Number(row.lng), Number(row.lat)] } : null
        const { error } = await supabase
          .from('stations')
          .update({
            lat: row.lat,
            lng: row.lng,
            location,
            address_text: row.address_text,
            brand: row.brand,
            country_code: row.country_code,
          })
          .eq('id', existing.id)
        if (error) {
          failed++
          if (failed <= 3) console.warn('  Update fail:', row.name, error.message)
        } else {
          updated++
        }
        continue
      }
      if (!existingByKey.has(rowKey(row))) toInsert.push(row)
    }
    if (updated) console.log(`Updated (name+township+city): ${updated}.`)
  } else {
    const skipCount = rows.filter((r) => existingByKey.has(rowKey(r))).length
    for (const r of rows) {
      if (!existingByKey.has(rowKey(r))) toInsert.push(r)
    }
    if (rows.length - toInsert.length > 0) {
      console.log(`Already in DB: ${rows.length - toInsert.length}. Will insert only ${toInsert.length} new.\n`)
    }
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase.from('stations').insert(batch).select('id')
    if (error) {
      for (const row of batch) {
        const { error: e } = await supabase.from('stations').insert(row).select('id')
        if (e) {
          failed++
          if (failed <= 3) console.warn('  Skip/fail:', row.name, e.message)
        } else {
          inserted++
        }
      }
    } else {
      inserted += (data && data.length) || batch.length
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toInsert.length)} / ${toInsert.length}\r`)
  }

  console.log(`\nDone. Inserted: ${inserted}, updated: ${updated || 0}, failed: ${failed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
