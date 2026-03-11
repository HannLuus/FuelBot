#!/usr/bin/env node
/**
 * LEGACY: Sets lat/lng to null for stacked stations (they stay in DB as address-only).
 * Prefer scripts/dedupe-stacked-stations.mjs instead: it keeps one row per coord and DELETES
 * the rest, so duplicate rows are removed from the database.
 *
 * Usage: node scripts/unstack-duplicate-coords.mjs [--dry-run] [--min-count=10]
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

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const minCountArg = args.find((a) => a.startsWith('--min-count='))
const MIN_COUNT = minCountArg ? parseInt(minCountArg.split('=')[1], 10) : 10

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const EPS = 0.00001

function round5(n) {
  return Math.round(n * 100000) / 100000
}

async function main() {
  const { data: stations, error: e0 } = await supabase
    .from('stations')
    .select('id, name, lat, lng, township, city')
    .eq('is_active', true)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (e0) {
    console.error('Error fetching stations:', e0.message)
    process.exit(1)
  }

  const byKey = new Map()
  for (const s of stations ?? []) {
    const key = `${round5(s.lat)}|${round5(s.lng)}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(s)
  }

  const stacked = [...byKey.entries()].filter(([, list]) => list.length >= MIN_COUNT)
  if (stacked.length === 0) {
    console.log(`No coordinate shared by >= ${MIN_COUNT} stations.`)
    return
  }

  console.log(`Found ${stacked.length} coordinate(s) with >= ${MIN_COUNT} stations (placeholder coords).`)
  console.log('')

  let totalToNull = 0
  for (const [key, list] of stacked) {
    const [latStr, lngStr] = key.split('|')
    const lat = parseFloat(latStr)
    const lng = parseFloat(lngStr)
    console.log(`--- ${list.length} stations at (${lat}, ${lng}) ---`)
    list.slice(0, 5).forEach((s) => console.log(`  ${s.name} | ${s.township}, ${s.city}`))
    if (list.length > 5) console.log(`  ... and ${list.length - 5} more`)
    console.log('')
    totalToNull += list.length
  }

  const idsToNull = stacked.flatMap(([, list]) => list.map((s) => s.id))

  if (dryRun) {
    console.log(`[DRY RUN] Would set lat/lng to null for ${idsToNull.length} stations. Run without --dry-run to apply.`)
    return
  }

  console.log(`Setting lat/lng to null for ${idsToNull.length} stations...`)
  const BATCH = 50
  let updated = 0
  for (let i = 0; i < idsToNull.length; i += BATCH) {
    const batch = idsToNull.slice(i, i + BATCH)
    const { error } = await supabase
      .from('stations')
      .update({ lat: null, lng: null })
      .in('id', batch)
    if (error) {
      console.error('Update error:', error.message)
      process.exit(1)
    }
    updated += batch.length
    process.stdout.write(`  ${updated} / ${idsToNull.length}\r`)
  }
  console.log(`\nDone. ${updated} stations are now address-only (no map pin) until correct coordinates are set.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
