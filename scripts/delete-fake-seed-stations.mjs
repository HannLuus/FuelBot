#!/usr/bin/env node
/**
 * One-off: delete the 6 original seed stations from the live DB.
 * Run: npm run delete-fake-stations
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const FAKE_STATIONS = [
  { name: 'Myanmar Petroleum Station', city: 'Yangon' },
  { name: 'Shwe Taung Gas Station', city: 'Yangon' },
  { name: 'Parami Gas Station', city: 'Yangon' },
  { name: 'Golden Valley Station', city: 'Yangon' },
  { name: 'North Dagon Fuel', city: 'Yangon' },
  { name: 'Mandalay City Fuel', city: 'Mandalay' },
]

async function main() {
  const supabase = createClient(url, key)
  for (const { name, city } of FAKE_STATIONS) {
    const { data, error } = await supabase.from('stations').delete().eq('name', name).eq('city', city).select('id')
    if (error) console.warn('Delete failed:', name, error.message)
    else if (data && data.length) console.log('Deleted:', name, city)
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
