#!/usr/bin/env node
/**
 * Remove duplicate stations at the same GPS coordinates.
 * For each coordinate with 5+ stations (placeholder/wrong data), KEEP ONE and DELETE the rest.
 * No "null and leave in DB" – duplicate rows are removed from the database.
 *
 * Keep: prefer row with verification_source set, else smallest id.
 * Tables with ON DELETE CASCADE (e.g. station_location_reports, station_status_snapshots,
 * referral_rewards) will have their rows removed automatically.
 *
 * Usage: node scripts/dedupe-stacked-stations.mjs [--dry-run] [--min-count=5]
 *        node scripts/dedupe-stacked-stations.mjs --delete-address-only [--dry-run]
 *          Removes stations that have null lat/lng (e.g. the ones we "unstacked" earlier).
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
const deleteAddressOnly = args.includes('--delete-address-only')
const minCountArg = args.find((a) => a.startsWith('--min-count='))
const MIN_COUNT = minCountArg ? parseInt(minCountArg.split('=')[1], 10) : 5

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function round5(n) {
  return Math.round(n * 100000) / 100000
}

function pickKeepId(list) {
  const withSource = list.filter((s) => s.verification_source && s.verification_source !== '')
  if (withSource.length > 0) return withSource.sort((a, b) => a.id.localeCompare(b.id))[0].id
  return list.sort((a, b) => a.id.localeCompare(b.id))[0].id
}

async function main() {
  if (deleteAddressOnly) {
    const { data: nullCoord, error: eNull } = await supabase
      .from('stations')
      .select('id, name, township, city')
      .eq('is_active', true)
      .is('lat', null)
      .is('lng', null)
    if (eNull) {
      console.error('Error fetching address-only stations:', eNull.message)
      process.exit(1)
    }
    const list = nullCoord ?? []
    console.log(`Stations with null lat/lng (address-only): ${list.length}`)
    if (list.length === 0) {
      console.log('Nothing to delete.')
      return
    }
    if (dryRun) {
      console.log('[DRY RUN] Would DELETE', list.length, 'rows. Run without --dry-run to apply.')
      list.slice(0, 5).forEach((s) => console.log('  ', s.name, '|', s.township, s.city))
      if (list.length > 5) console.log('  ... and', list.length - 5, 'more')
      return
    }
    const ids = list.map((s) => s.id)
    const BATCH = 50
    let deleted = 0
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      const { error } = await supabase.from('stations').delete().in('id', batch)
      if (error) {
        console.error('Delete error:', error.message)
        process.exit(1)
      }
      deleted += batch.length
      process.stdout.write(`  ${deleted} / ${ids.length}\r`)
    }
    console.log(`\nDone. Deleted ${deleted} address-only station rows.`)
    return
  }

  const { data: stations, error: e0 } = await supabase
    .from('stations')
    .select('id, name, lat, lng, township, city, verification_source')
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
    console.log(`No coordinate with >= ${MIN_COUNT} stations. Nothing to dedupe.`)
    return
  }

  const toDelete = []
  for (const [key, list] of stacked) {
    const keepId = pickKeepId(list)
    const idsToRemove = list.filter((s) => s.id !== keepId).map((s) => s.id)
    toDelete.push(...idsToRemove)
    const [latStr, lngStr] = key.split('|')
    console.log(`At (${latStr}, ${lngStr}): keep 1, delete ${idsToRemove.length} (of ${list.length})`)
  }

  const totalDelete = toDelete.length
  console.log('')
  console.log(`Total rows to DELETE: ${totalDelete}`)

  if (dryRun) {
    console.log('[DRY RUN] No rows deleted. Run without --dry-run to apply.')
    return
  }

  console.log('Deleting...')
  const BATCH = 25
  let deleted = 0
  let failed = 0
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH)
    const { error } = await supabase.from('stations').delete().in('id', batch)
    if (error) {
      console.error('Delete error:', error.message)
      failed += batch.length
    } else {
      deleted += batch.length
    }
    process.stdout.write(`  ${deleted + failed} / ${totalDelete}\r`)
  }
  console.log(`\nDone. Deleted: ${deleted}${failed ? `, failed: ${failed}` : ''}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
