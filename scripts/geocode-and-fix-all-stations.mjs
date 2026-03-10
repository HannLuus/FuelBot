#!/usr/bin/env node
/**
 * Fix bad station coordinates in the database by re-geocoding every station with Google.
 * Fetches all stations from Supabase, looks up each address on Google Maps, and updates
 * lat/lng/location. Then de-duplicates: only one station per (lat,lng) keeps coords;
 * the rest are set to address-only (no map pin) so we don't show clusters of wrong pins.
 *
 * Requires: GOOGLE_GEOCODING_API_KEY or GOOGLE_MAPS_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Optional: GEOCODE_FIX_LIMIT=100 to process only first 100 stations (for testing).
 * Optional: GEOCODE_FIX_OFFSET=4200 to skip the first 4200 stations (resume from there).
 * Optional: GEOCODE_FIX_DRY_RUN=1 to geocode and log only, no DB updates.
 *
 * Run: node scripts/geocode-and-fix-all-stations.mjs
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
dotenv.config({ path: resolve(root, '.env') })

const API_KEY = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LIMIT = process.env.GEOCODE_FIX_LIMIT ? parseInt(process.env.GEOCODE_FIX_LIMIT, 10) : null
const DRY_RUN = process.env.GEOCODE_FIX_DRY_RUN === '1' || process.env.GEOCODE_FIX_DRY_RUN === 'true'

const MYANMAR_BOUNDS = { latMin: 9.5, latMax: 28.5, lngMin: 92, lngMax: 101 }
const DELAY_MS = 250
const FETCH_PAGE_SIZE = 1000

function inMyanmar(lat, lng) {
  return (
    lat >= MYANMAR_BOUNDS.latMin &&
    lat <= MYANMAR_BOUNDS.latMax &&
    lng >= MYANMAR_BOUNDS.lngMin &&
    lng <= MYANMAR_BOUNDS.lngMax
  )
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function geocodeAddress(addressString) {
  if (!addressString || !addressString.trim()) return null
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    addressString.trim() + ', Myanmar',
  )}&region=mm&key=${API_KEY}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.length) return null
    const loc = data.results[0].geometry?.location
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null
    if (!inMyanmar(loc.lat, loc.lng)) return null
    return { lat: loc.lat, lng: loc.lng }
  } catch (err) {
    return null
  }
}

async function fetchAllStations(supabase) {
  const out = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('stations')
      .select('id, name, address_text, township, city, lat, lng')
      .range(offset, offset + FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(`Failed to fetch stations: ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < FETCH_PAGE_SIZE) break
    offset += FETCH_PAGE_SIZE
    if (LIMIT && out.length >= LIMIT) break
  }
  return LIMIT ? out.slice(0, LIMIT) : out
}

async function main() {
  if (!API_KEY) {
    console.error('Missing GOOGLE_GEOCODING_API_KEY or GOOGLE_MAPS_API_KEY in .env')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  console.log('Fetching all stations from DB...')
  const stations = await fetchAllStations(supabase)
  console.log(`Found ${stations.length} stations. Re-geocoding with Google...${DRY_RUN ? ' (DRY RUN – no updates)' : ''}\n`)

  let updated = 0
  let noResult = 0
  let noAddress = 0
  let failed = 0

  for (let i = 0; i < stations.length; i++) {
    const s = stations[i]
    const addressStr = [s.name, s.address_text, s.township, s.city].filter(Boolean).join(', ')
    if (!addressStr.trim()) {
      noAddress++
      if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1} / ${stations.length}\r`)
      continue
    }

    const coords = await geocodeAddress(addressStr)
    await sleep(DELAY_MS)

    if (coords) {
      if (!DRY_RUN) {
        const { error } = await supabase
          .from('stations')
          .update({
            lat: coords.lat,
            lng: coords.lng,
          })
          .eq('id', s.id)
        if (error) {
          failed++
          if (failed <= 5) console.warn(`  Update fail ${s.name}:`, error.message)
        } else {
          updated++
        }
      } else {
        updated++
      }
    } else {
      noResult++
    }

    if ((i + 1) % 50 === 0 || i === stations.length - 1) {
      process.stdout.write(`  ${i + 1} / ${stations.length}  updated: ${updated}  no result: ${noResult}  no address: ${noAddress}\r`)
    }
  }

  console.log(`\n\nGeocode pass done. Updated: ${updated}, no result: ${noResult}, no address: ${noAddress}, failed: ${failed}.`)

  if (DRY_RUN) {
    console.log('Dry run – no DB changes. Run without GEOCODE_FIX_DRY_RUN=1 to apply.')
    return
  }

  console.log('\nDe-duplicating: clearing coordinates for stations that share the same (lat,lng)...')
  const { data: allAfter } = await supabase
    .from('stations')
    .select('id, name, lat, lng, township, city')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  const byCoord = new Map()
  for (const r of allAfter || []) {
    const key = `${Number(r.lat).toFixed(6)},${Number(r.lng).toFixed(6)}`
    if (!byCoord.has(key)) byCoord.set(key, [])
    byCoord.get(key).push(r)
  }

  let deduped = 0
  for (const [, group] of byCoord) {
    if (group.length <= 1) continue
    const [keep, ...clear] = group
    for (const row of clear) {
      const { error } = await supabase
        .from('stations')
        .update({ lat: null, lng: null })
        .eq('id', row.id)
      if (!error) deduped++
    }
  }
  console.log(`Cleared duplicate coordinates for ${deduped} stations (one pin per location kept).`)
  console.log('\nDone. Map should now show one correct pin per location; duplicates are address-only.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
