#!/usr/bin/env node
/**
 * Count verified vs unverified stations and list where verified ones are.
 * Requires .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run: node scripts/check-verification-stats.mjs
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Total active stations in the table
  const { count: totalActive, error: e0 } = await supabase
    .from('stations')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  if (e0) {
    console.error('Error counting stations:', e0.message)
    process.exit(1)
  }

  // Count how many have a map pin (location not null) – these are the only ones that can appear on the map
  const { count: withLocationCount, error: eCount } = await supabase
    .from('stations')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .not('location', 'is', null)

  if (eCount) {
    console.error('Error counting with location:', eCount.message)
    process.exit(1)
  }

  const noLocationCount = (totalActive ?? 0) - (withLocationCount ?? 0)

  console.log('--- Total in Supabase (active only) ---')
  console.log('Total active stations in table:', totalActive)
  console.log('  With map pin (have coordinates, can appear on map):', withLocationCount)
  console.log('  No map pin (address-only, never appear on map):', noLocationCount)
  console.log('')

  // Fetch all stations that HAVE a map pin (paginate so we get full count for verified vs unverified)
  let withLocationList = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data: page, error: e1 } = await supabase
      .from('stations')
      .select('id, name, city, township, verification_source, is_verified, created_at, location')
      .eq('is_active', true)
      .not('location', 'is', null)
      .range(offset, offset + pageSize - 1)
    if (e1) {
      console.error('Error fetching stations with location:', e1.message)
      process.exit(1)
    }
    if (!page?.length) break
    withLocationList = withLocationList.concat(page)
    if (page.length < pageSize) break
  }

  const verified = withLocationList.filter(
    (s) => s.is_verified || (s.verification_source && s.verification_source !== '')
  )
  const unverified = withLocationList.filter(
    (s) => !s.is_verified && (!s.verification_source || s.verification_source === '')
  )

  const bySource = {}
  for (const s of verified) {
    const src = s.verification_source || (s.is_verified ? 'owner' : 'unknown')
    bySource[src] = (bySource[src] || 0) + 1
  }

  console.log(`--- Of the ${withLocationCount} stations THAT HAVE A MAP PIN ---`)
  console.log('Verified (solid pin):', verified.length)
  console.log('Unverified (dashed pin):', unverified.length)
  console.log('\nVerified by source:', bySource)
  console.log('\n--- Where verified stations are (city) ---')
  const byCity = {}
  for (const s of verified) {
    const c = s.city || '—'
    byCity[c] = (byCity[c] || 0) + 1
  }
  const cities = Object.entries(byCity).sort((a, b) => b[1] - a[1])
  for (const [city, count] of cities.slice(0, 25)) {
    console.log(`  ${city}: ${count}`)
  }
  if (cities.length > 25) console.log(`  ... and ${cities.length - 25} more cities`)

  console.log('\n--- Sample verified stations (first 15) ---')
  for (const s of verified.slice(0, 15)) {
    console.log(`  ${s.name} | ${s.city} | ${s.township || '—'} | ${s.verification_source || (s.is_verified ? 'owner' : '?')}`)
  }

  console.log('\n--- Sample unverified stations (first 10) ---')
  for (const s of unverified.slice(0, 10)) {
    console.log(`  ${s.name} | ${s.city} | ${s.township || '—'}`)
  }

  console.log('\n--- Where to find verified stations in the app ---')
  console.log('  • Map/List: Pan to Yangon, Mandalay, Bago, or other cities above. Verified pins have a solid border; unverified have a dashed/grey border.')
  console.log(`  • Filter: Turn on "Verified only" to show only the ${verified.length} verified stations (they appear only within your radius).`)
  console.log('  • Unverified stations older than 3 months are hidden from the map/list until they get a verification source.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
