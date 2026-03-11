#!/usr/bin/env node
/**
 * Find all stations at the same GPS coordinates as a given station (by ID).
 * Usage: node scripts/check-duplicate-coords.mjs <station_id>
 * Example: node scripts/check-duplicate-coords.mjs 466400f1-5e15-4b92-9a46-4b815549dca4
 */

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
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const stationId = process.argv[2]
if (!stationId) {
  console.error('Usage: node scripts/check-duplicate-coords.mjs <station_id>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Small epsilon for float comparison (≈ metres)
const EPS = 0.00001

async function main() {
  const { data: station, error: e0 } = await supabase
    .from('stations')
    .select('id, name, lat, lng, township, city, brand, verification_source')
    .eq('id', stationId)
    .single()

  if (e0 || !station) {
    console.error('Station not found:', e0?.message || 'No data')
    process.exit(1)
  }

  const { lat, lng } = station
  if (lat == null || lng == null) {
    console.error('Station has no coordinates (address-only)')
    process.exit(1)
  }

  console.log('--- Reference station ---')
  console.log('ID:', station.id)
  console.log('Name:', station.name)
  console.log('Lat/Lng:', lat, lng)
  console.log('Township:', station.township, '| City:', station.city, '| Brand:', station.brand)
  console.log('')

  // Fetch all active stations with coordinates in a tiny bounding box (same spot)
  const { data: allNear, error: e1 } = await supabase
    .from('stations')
    .select('id, name, lat, lng, township, city, brand, verification_source')
    .eq('is_active', true)
    .gte('lat', lat - EPS)
    .lte('lat', lat + EPS)
    .gte('lng', lng - EPS)
    .lte('lng', lng + EPS)

  if (e1) {
    console.error('Error fetching by coords:', e1.message)
    process.exit(1)
  }

  const atSameSpot = (allNear ?? []).filter(
    (s) => Math.abs(s.lat - lat) < EPS && Math.abs(s.lng - lng) < EPS
  )

  console.log('--- Stations at the same GPS coordinates ---')
  console.log('Count:', atSameSpot.length)
  console.log('')
  atSameSpot.forEach((s, i) => {
    console.log(`${i + 1}. ${s.name}`)
    console.log(`   ID: ${s.id} | ${s.township || '—'}, ${s.city || '—'} | brand: ${s.brand ?? 'null'} | verification_source: ${s.verification_source ?? 'null'}`)
    console.log('')
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
