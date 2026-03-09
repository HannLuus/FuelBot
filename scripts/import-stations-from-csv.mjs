#!/usr/bin/env node
/**
 * Import fuel stations from data/stations-yangon-mandalay.csv into Supabase.
 *
 * Requires in .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run: npm run import-stations
 *
 * Uses service role to bypass RLS. Inserts in batches; skips rows that fail
 * (e.g. duplicate by app logic) and continues.
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

const CSV_PATH = resolve(root, 'data', 'stations-yangon-mandalay.csv')
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
    throw new Error('CSV must have columns: name, brand, lat, lng, address_text, township, city, country_code')
  }
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i])
    const name = (cells[nameIdx] ?? '').trim()
    if (!name) continue
    const lat = Number(cells[latIdx])
    const lng = Number(cells[lngIdx])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const brand = (cells[brandIdx] ?? '').trim() || null
    const address_text = (cells[addressIdx] ?? '').trim() || null
    const township = (cells[townshipIdx] ?? '').trim() || '—'
    const city = (cells[cityIdx] ?? '').trim() || 'Yangon'
    const country_code = (cells[countryIdx] ?? '').trim() || 'MM'
    rows.push({
      name,
      brand,
      lat,
      lng,
      address_text,
      township,
      city,
      country_code,
    })
  }
  return rows
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
  let inserted = 0
  let failed = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
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
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}\r`)
  }

  console.log(`\nDone. Inserted: ${inserted}, skipped/failed: ${failed}, total rows: ${rows.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
