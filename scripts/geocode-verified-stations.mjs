#!/usr/bin/env node
/**
 * Geocode verified stations using Google Maps only.
 *
 * Fuel stations (Denko, BOC, Max, etc.) are already on Google Maps. We look them up there
 * and take the coordinates — we don't look on other maps that have fewer stations, and we
 * never invent coordinates. If it's not on Google Maps, we leave lat/lng empty (address-only).
 *
 * Requires: GOOGLE_GEOCODING_API_KEY or GOOGLE_MAPS_API_KEY in .env
 * Enable Geocoding API: https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com
 *
 * Run: node scripts/geocode-verified-stations.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
dotenv.config({ path: resolve(root, '.env') })

const API_KEY = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY
const DATA_DIR = resolve(root, 'data')
const IN_CSV = resolve(DATA_DIR, 'verified-stations.csv')
const OUT_CSV = resolve(DATA_DIR, 'verified-stations.csv')

// Myanmar approximate bounds (only accept results in country)
const MYANMAR_BOUNDS = { latMin: 9.5, latMax: 28.5, lngMin: 92, lngMax: 101 }
const DELAY_MS = 250

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
            end += 2
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

function escapeCsv(s) {
  if (s == null || s === '') return ''
  const t = String(s)
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

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
    console.warn('Geocode request failed:', err.message)
    return null
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Missing GOOGLE_GEOCODING_API_KEY or GOOGLE_MAPS_API_KEY in .env')
    console.error('We use Google Maps because that is where fuel stations are already on the map (Denko, BOC, etc.).')
    console.error('Add a key and enable Geocoding API: https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com')
    process.exit(1)
  }
  if (!existsSync(IN_CSV)) {
    console.error(`Run build-verified-stations first. Not found: ${IN_CSV}`)
    process.exit(1)
  }

  const raw = readFileSync(IN_CSV, 'utf8')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    console.error('CSV has no data rows.')
    process.exit(1)
  }

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
    addressIdx === -1 ||
    townshipIdx === -1 ||
    cityIdx === -1
  ) {
    console.error('CSV must have name, brand, lat, lng, address_text, township, city, country_code')
    process.exit(1)
  }

  const rows = []
  let geocoded = 0
  let skipped = 0
  let failed = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i])
    const name = (cells[nameIdx] ?? '').trim()
    if (!name) continue

    const existingLat = (cells[latIdx] ?? '').trim()
    const existingLng = (cells[lngIdx] ?? '').trim()
    const hasCoords = existingLat !== '' && existingLng !== '' && Number.isFinite(Number(existingLat)) && Number.isFinite(Number(existingLng))

    const address_text = (cells[addressIdx] ?? '').trim()
    const township = (cells[townshipIdx] ?? '').trim()
    const city = (cells[cityIdx] ?? '').trim()
    // Include station name so Google can resolve to the actual POI (e.g. "Max Energy Ahlone") when it's on the map
    const addressForGeocode = [name, address_text, township, city].filter(Boolean).join(', ')

    let lat = existingLat
    let lng = existingLng

    if (!hasCoords && addressForGeocode) {
      const coords = await geocodeAddress(addressForGeocode)
      if (coords) {
        lat = coords.lat.toFixed(6)
        lng = coords.lng.toFixed(6)
        geocoded++
      } else {
        skipped++
      }
      await sleep(DELAY_MS)
    } else if (!hasCoords) {
      failed++
    }

    const brand = (cells[brandIdx] ?? '').trim()
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
    if ((i - 1) % 20 === 0 && i > 1) {
      process.stdout.write(`  ${i - 1} / ${lines.length - 1} rows\r`)
    }
  }

  // De-duplicate coordinates: only one station per (lat,lng) gets a pin; others stay address-only so we don't show a cluster
  const seenCoords = new Set()
  let deduped = 0
  const outRows = rows.map((r) => {
    const hasCoords = r.lat !== '' && r.lng !== '' && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))
    if (!hasCoords) {
      return [escapeCsv(r.name), escapeCsv(r.brand), r.lat, r.lng, escapeCsv(r.address_text), escapeCsv(r.township), escapeCsv(r.city), r.country_code].join(',')
    }
    const key = `${r.lat},${r.lng}`
    if (seenCoords.has(key)) {
      deduped++
      return [escapeCsv(r.name), escapeCsv(r.brand), '', '', escapeCsv(r.address_text), escapeCsv(r.township), escapeCsv(r.city), r.country_code].join(',')
    }
    seenCoords.add(key)
    return [escapeCsv(r.name), escapeCsv(r.brand), r.lat, r.lng, escapeCsv(r.address_text), escapeCsv(r.township), escapeCsv(r.city), r.country_code].join(',')
  })

  const headerLine = lines[0]
  const csv = [headerLine, ...outRows].join('\n')
  writeFileSync(OUT_CSV, csv, 'utf8')

  console.log(`\nWrote ${OUT_CSV}`)
  console.log(`Geocoded: ${geocoded} (coordinates from Google Maps).`)
  if (deduped) console.log(`Duplicate locations removed from map: ${deduped} (same lat/lng as another station → address-only).`)
  console.log(`No result / out of bounds: ${skipped}.`)
  if (failed) console.log(`No address to geocode: ${failed}.`)
  console.log('Only one pin per unique location; duplicates stay address-only so the map does not show a cluster.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
