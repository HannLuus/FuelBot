#!/usr/bin/env node
/**
 * Source fuel stations across Myanmar cities via Gemini API or Vertex AI and write CSV.
 *
 * Option A – Gemini API (Google AI Studio):
 *   Set GEMINI_API_KEY in .env. If you get "User location is not supported", use Option B.
 *
 * Option B – Vertex AI (bypasses geo-restriction when using a supported region):
 *   Set USE_VERTEX_AI=1 and either:
 *   - VERTEX_API_KEY (or GEMINI_API_KEY) for Vertex Express mode, and optionally
 *     VERTEX_LOCATION=us-central1 (or another supported region), or
 *   - VERTEX_PROJECT + VERTEX_LOCATION for full Vertex (auth via gcloud / GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Run: npm run source-stations
 * Output: data/stations-myanmar.csv
 * Cities: Yangon, Mandalay, Naypyidaw, Mawlamyine, Bago, Taunggyi, Pathein, Hinthada, Pyay.
 * Also fetches stations along major highways (Yangon–Mandalay, Yangon–Mawlamyine, Yangon–Pathein, Yangon–Pyay, Pathein–Hinthada).
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
dotenv.config({ path: resolve(root, '.env') })

const USE_VERTEX_AI = /^1|true|yes$/i.test(process.env.USE_VERTEX_AI || process.env.VERTEX_AI || '')
const VERTEX_API_KEY = process.env.VERTEX_API_KEY || process.env.GEMINI_API_KEY
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'

if (!USE_VERTEX_AI && !process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY. Set it in .env or run: GEMINI_API_KEY=your_key npm run source-stations')
  console.error('To use Vertex AI instead (e.g. to avoid geo-restriction), set USE_VERTEX_AI=1 and VERTEX_API_KEY (or VERTEX_PROJECT + VERTEX_LOCATION).')
  process.exit(1)
}
if (USE_VERTEX_AI && !VERTEX_API_KEY && !(VERTEX_PROJECT && VERTEX_LOCATION)) {
  console.error('Vertex AI is enabled but neither API key nor project+location is set.')
  console.error('Set VERTEX_API_KEY (or GEMINI_API_KEY) for Vertex Express, or VERTEX_PROJECT and VERTEX_LOCATION for full Vertex.')
  process.exit(1)
}

// [lat, lng] fallback when Gemini omits coordinates (used in normalizeStation)
const CITY_CENTERS = {
  Yangon: [16.8661, 96.1561],
  Mandalay: [21.9588, 96.0891],
  Naypyidaw: [19.7475, 96.1153],
  Mawlamyine: [16.4919, 97.628],
  Bago: [17.3208, 96.5267],
  Taunggyi: [20.7892, 97.0378],
  Pathein: [16.7742, 94.7322],
  Hinthada: [17.65, 95.45],
  Pyay: [18.8242, 95.2136],
}

// Major highways connecting our app cities (for fuel stations along routes)
const HIGHWAY_ROUTES = [
  { id: 'Yangon-Mandalay', name: 'Yangon–Mandalay Expressway', from: 'Yangon', to: 'Mandalay', via: 'Bago, Naypyidaw' },
  { id: 'Yangon-Mawlamyine', name: 'Yangon–Mawlamyine road (NH1)', from: 'Yangon', to: 'Mawlamyine', via: 'Thaton' },
  { id: 'Yangon-Pathein', name: 'Yangon–Pathein (NH8 / Western Union Highway)', from: 'Yangon', to: 'Pathein', via: '' },
  { id: 'Yangon-Pyay', name: 'Yangon–Pyay Highway (Route 2)', from: 'Yangon', to: 'Pyay', via: 'Hlegu, Tharrawaddy, Letpadan' },
  { id: 'Pathein-Hinthada', name: 'Pathein–Hinthada road', from: 'Pathein', to: 'Hinthada', via: '' },
]

// City config: townships to query and minimum target count (supplement if below)
const CITIES = [
  {
    city: 'Yangon',
    townships: [
      'Ahlon', 'Bahan', 'Botahtaung', 'Dagon', 'Dagon Seikkan', 'Dala', 'Dawbon', 'Hlaing', 'Hlaingthaya',
      'Insein', 'Kamayut', 'Kyauktada', 'Kyeemyindaing', 'Lanmadaw', 'Latha', 'Mayangon', 'Mingaladon',
      'Mingala Taungnyunt', 'North Dagon', 'North Okkalapa', 'Pabedan', 'Pazundaung', 'Seikkyi Kanaungto',
      'Shwepyitha', 'South Dagon', 'South Okkalapa', 'Tamwe', 'Thaketa', 'Thingangyun', 'Yankin',
    ],
    target: 100,
  },
  {
    city: 'Mandalay',
    townships: [
      'Amarapura', 'Aungmyethazan', 'Chan Aye Thar Zan', 'Chanmyathazi', 'Maha Aungmye', 'Patheingyi', 'Pyigyidagun',
    ],
    target: 70,
  },
  {
    city: 'Naypyidaw',
    townships: [
      'Tatkone', 'Ottarathiri', 'Pobbathiri', 'Zeyathiri', 'Lewe', 'Dekkhinathiri', 'Zabuthiri', 'Pyinmana',
    ],
    target: 40,
  },
  {
    city: 'Mawlamyine',
    townships: ['Mawlamyine', 'Mudon', 'Thanbyuzayat', 'Chaungzon', 'Kyaikmaraw'],
    target: 35,
  },
  {
    city: 'Bago',
    townships: ['Bago', 'Kawa', 'Thanatpin', 'Waw'],
    target: 40,
  },
  {
    city: 'Taunggyi',
    townships: ['Taunggyi', 'Kalaw', 'Nyaungshwe', 'Hopong', 'Lawksawk'],
    target: 35,
  },
  {
    city: 'Pathein',
    townships: ['Pathein', 'Thabaung', 'Ngapudaw', 'Kangyidaunt'],
    target: 30,
  },
  {
    city: 'Hinthada',
    townships: ['Hinthada'],
    target: 25,
  },
  {
    city: 'Pyay',
    townships: ['Pyay', 'Paukkung', 'Shwedaung', 'Pandaung'],
    target: 30,
  },
]

// Myanmar approximate bounds for validation
const MYANMAR_LAT_MIN = 9.5
const MYANMAR_LAT_MAX = 28.5
const MYANMAR_LNG_MIN = 92.0
const MYANMAR_LNG_MAX = 101.0

const CSV_HEADER = 'name,brand,lat,lng,address_text,township,city,country_code'

function stationKey(s) {
  return `${(s.name || '').trim()}|${Number(s.lat).toFixed(5)}|${Number(s.lng).toFixed(5)}|${(s.city || '').trim()}`
}

/** Parse CSV line respecting quoted fields */
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
            end += 2
            continue
          }
          parts.push(line.slice(i + 1, end))
          out.push(parts.join('').replace(/""/g, '"').trim())
          i = end + 1
          if (line[i] === ',') i++
          end = i
          break
        }
        end++
      }
      if (end >= line.length) {
        out.push(parts.join('').replace(/""/g, '"').trim())
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

/** Load existing stations from data/*.csv so we skip cities that already meet target and avoid re-fetching. */
function loadExistingStations() {
  const dataDir = resolve(root, 'data')
  const files = ['stations-myanmar.csv', 'stations-yangon-mandalay.csv']
  const all = []
  const keySet = new Set()
  const byCity = {}

  for (const file of files) {
    const path = resolve(dataDir, file)
    if (!existsSync(path)) continue
    const raw = readFileSync(path, 'utf8')
    const lines = raw.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) continue
    const header = parseCSVLine(lines[0])
    const nameIdx = header.indexOf('name')
    const latIdx = header.indexOf('lat')
    const lngIdx = header.indexOf('lng')
    const cityIdx = header.indexOf('city')
    const brandIdx = header.indexOf('brand')
    const addressIdx = header.indexOf('address_text')
    const townshipIdx = header.indexOf('township')
    if (nameIdx === -1 || latIdx === -1 || lngIdx === -1 || cityIdx === -1) continue
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i])
      const name = (cells[nameIdx] ?? '').trim()
      if (!name) continue
      const lat = Number(cells[latIdx])
      const lng = Number(cells[lngIdx])
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const city = (cells[cityIdx] ?? '').trim() || 'Yangon'
      const row = {
        name,
        brand: (cells[brandIdx] ?? '').trim() || null,
        lat,
        lng,
        address_text: (cells[addressIdx] ?? '').trim() || null,
        township: (cells[townshipIdx] ?? '').trim() || '—',
        city,
        country_code: 'MM',
      }
      const key = stationKey(row)
      if (keySet.has(key)) continue
      keySet.add(key)
      all.push(row)
      byCity[city] = byCity[city] || []
      byCity[city].push(row)
    }
  }
  return { stations: all, keySet, byCity }
}

function escapeCsv(value) {
  if (value == null) return ''
  const s = String(value).trim()
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function rowToCsv(row) {
  return [
    escapeCsv(row.name),
    escapeCsv(row.brand),
    row.lat,
    row.lng,
    escapeCsv(row.address_text),
    escapeCsv(row.township),
    escapeCsv(row.city),
    escapeCsv(row.country_code),
  ].join(',')
}

function parseNumber(v, fallback) {
  if (v == null) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normalizeStation(raw, city) {
  const [fallbackLat, fallbackLng] = CITY_CENTERS[city] ?? [19.7475, 96.1153]
  const lat = parseNumber(raw.lat, fallbackLat)
  const lng = parseNumber(raw.lng, fallbackLng)
  return {
    name: (raw.name && String(raw.name).trim()) || 'Unknown',
    brand: raw.brand != null ? String(raw.brand).trim() || null : null,
    lat,
    lng,
    address_text: raw.address_text != null ? String(raw.address_text).trim() || null : null,
    township: (raw.township && String(raw.township).trim()) || '—',
    city,
    country_code: 'MM',
  }
}

function inMyanmar(lat, lng) {
  return (
    lat >= MYANMAR_LAT_MIN &&
    lat <= MYANMAR_LAT_MAX &&
    lng >= MYANMAR_LNG_MIN &&
    lng <= MYANMAR_LNG_MAX
  )
}

function extractJson(text) {
  let s = (text || '').trim()
  const codeBlock = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) s = codeBlock[1].trim()
  const arrayMatch = s.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return s
}

function buildTownshipPrompt(township, city, existingNamesInCity = []) {
  const exclude =
    existingNamesInCity.length > 0
      ? ` We already have these stations in ${city} (do NOT list them again): ${existingNamesInCity.slice(0, 40).join(', ')}. List ONLY additional stations not in that list.`
      : ''
  return `List ALL known fuel/gas/petrol filling stations in ${township} township, ${city}, Myanmar.${exclude} Include: name, brand (e.g. MPE, Shwe Taung, Total, PTT, CNPC, or empty string), approximate latitude, approximate longitude, address or road name if known. Use township "${township}" for each. Return ONLY a valid JSON array of objects with exactly these keys: name, brand, lat, lng, address_text, township. No other text or markdown. Example: [{"name":"Station Name","brand":"MPE","lat":16.86,"lng":96.15,"address_text":"Road Name","township":"${township}"}]`
}

function buildSupplementPrompt(city, existingNames, targetCount) {
  const sample = existingNames.slice(0, 25).join(', ')
  return `We are building a comprehensive list of fuel/gas stations in ${city}, Myanmar. We already have these (and more): ${sample}. List ADDITIONAL fuel stations in ${city} that you have NOT listed above. Include name, brand, lat, lng, address_text, township. Return ONLY a valid JSON array. Add at least ${Math.min(30, targetCount)} more different stations. No other text or markdown. Keys: name, brand, lat, lng, address_text, township.`
}

function buildHighwayPrompt(route) {
  const via = route.via ? ` (via ${route.via})` : ''
  return `List fuel/gas/petrol filling stations along the ${route.name} in Myanmar, between ${route.from} and ${route.to}${via}. For each station give: name, brand (e.g. MPE, Shwe Taung, Total, PTT, or empty), approximate latitude, approximate longitude, address or road location if known, and nearest town or township. Return ONLY a valid JSON array of objects with exactly these keys: name, brand, lat, lng, address_text, township. No other text or markdown. Example: [{"name":"Station Name","brand":"MPE","lat":17.5,"lng":96.2,"address_text":"Near mile 50","township":"Taungoo"}]`
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchStationsFromPrompt(ai, city, prompt) {
  let response
  try {
    response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    })
  } catch (err) {
    const msg = err?.message ?? String(err)
    const status = err?.status ?? err?.code
    if ((status === 400 || /FAILED_PRECONDITION/i.test(msg)) && /location is not supported/i.test(msg)) {
      console.error('\n')
      console.error('Gemini API is not available from your current region (geo-restriction).')
      console.error('Options:')
      console.error('  1. Enable billing in Google AI Studio to remove the restriction.')
      console.error('  2. Run this script from a machine or VPN in a supported region (e.g. US, UK, India).')
      console.error('  3. Use Vertex AI Gemini in Google Cloud with a supported region.')
      process.exit(1)
    }
    throw err
  }
  let text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (typeof text !== 'string') text = String(text)
  const jsonStr = extractJson(text)
  let arr
  try {
    arr = JSON.parse(jsonStr)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr.map((raw) => normalizeStation(raw, city)).filter((s) => inMyanmar(s.lat, s.lng))
}

async function fetchHighwayStations(ai, route) {
  const prompt = buildHighwayPrompt(route)
  const cityLabel = `${route.id} Highway`
  const [fallbackLat, fallbackLng] = [19.0, 96.0]
  const response = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt })
  let text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (typeof text !== 'string') text = String(text)
  const jsonStr = extractJson(text)
  let arr
  try {
    arr = JSON.parse(jsonStr)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((raw) => {
      const lat = parseNumber(raw.lat, fallbackLat)
      const lng = parseNumber(raw.lng, fallbackLng)
      return {
        name: (raw.name && String(raw.name).trim()) || 'Unknown',
        brand: raw.brand != null ? String(raw.brand).trim() || null : null,
        lat,
        lng,
        address_text: raw.address_text != null ? String(raw.address_text).trim() || null : null,
        township: (raw.township && String(raw.township).trim()) || '—',
        city: cityLabel,
        country_code: 'MM',
      }
    })
    .filter((s) => inMyanmar(s.lat, s.lng))
}

function dedupeStations(stations) {
  const seen = new Set()
  return stations.filter((s) => {
    const key = `${s.name}|${s.lat.toFixed(5)}|${s.lng.toFixed(5)}|${s.city}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function fetchCityByTownships(ai, city, townships, existingNamesInCity = []) {
  const all = []
  for (let i = 0; i < townships.length; i++) {
    const township = townships[i]
    process.stdout.write(`  ${township}... `)
    const prompt = buildTownshipPrompt(township, city, existingNamesInCity)
    const batch = await fetchStationsFromPrompt(ai, city, prompt)
    all.push(...batch)
    console.log(batch.length)
    if (i < townships.length - 1) await delay(900)
  }
  return dedupeStations(all)
}

async function supplementCity(ai, city, existing, targetCount) {
  const need = targetCount - existing.length
  if (need <= 0) return []
  const names = existing.map((s) => s.name)
  const prompt = buildSupplementPrompt(city, names, need)
  const extra = await fetchStationsFromPrompt(ai, city, prompt)
  return extra
}

async function main() {
  const existing = loadExistingStations()
  if (existing.stations.length > 0) {
    const citySummary = Object.entries(existing.byCity)
      .map(([name, list]) => `${name}: ${list.length}`)
      .join(', ')
    console.log(`Loaded ${existing.stations.length} existing stations (${citySummary}). Skipping cities that already meet target.\n`)
  }

  const { GoogleGenAI } = await import('@google/genai')
  const aiOpts = USE_VERTEX_AI
    ? (VERTEX_API_KEY
        ? { vertexai: true, apiKey: VERTEX_API_KEY }
        : { vertexai: true, project: VERTEX_PROJECT, location: VERTEX_LOCATION })
    : { apiKey: process.env.GEMINI_API_KEY }
  const ai = new GoogleGenAI(aiOpts)
  if (USE_VERTEX_AI) console.log('Using Vertex AI', VERTEX_API_KEY ? '(API key)' : `(${VERTEX_PROJECT}/${VERTEX_LOCATION})`)

  const byCity = {}
  const keySet = new Set(existing.keySet)

  for (let c = 0; c < CITIES.length; c++) {
    const { city, townships, target } = CITIES[c]
    const existingInCity = existing.byCity[city] || []
    const existingNames = existingInCity.map((s) => s.name)

    if (existingInCity.length >= target) {
      console.log(`\n${city}: already have ${existingInCity.length} (target ${target}) – skipping (no API calls)`)
      byCity[city] = existingInCity
      continue
    }

    if (c > 0) await delay(1200)
    console.log(`\nFetching stations in ${city} (${townships.length} townships, have ${existingInCity.length}/${target})...`)
    let stations = await fetchCityByTownships(ai, city, townships, existingNames)
    const newOnly = stations.filter((s) => {
      const key = stationKey(s)
      if (keySet.has(key)) return false
      keySet.add(key)
      return true
    })
    stations = dedupeStations([...existingInCity, ...newOnly])
    console.log(`  ${city} total so far: ${stations.length} (${newOnly.length} new)`)

    for (let round = 1; stations.length < target && round <= 2; round++) {
      console.log(`  Supplement round ${round} (target ${target})...`)
      await delay(1000)
      const extra = await supplementCity(ai, city, stations, target)
      const extraNew = extra.filter((s) => {
        const key = stationKey(s)
        if (keySet.has(key)) return false
        keySet.add(key)
        return true
      })
      stations = dedupeStations([...stations, ...extraNew])
      console.log(`  ${city} after supplement: ${stations.length} (${extraNew.length} new)`)
    }

    byCity[city] = stations
  }

  const highwayStations = []
  if (HIGHWAY_ROUTES.length > 0) {
    await delay(1200)
    console.log(`\nFetching stations along ${HIGHWAY_ROUTES.length} major highways...`)
    for (let h = 0; h < HIGHWAY_ROUTES.length; h++) {
      const route = HIGHWAY_ROUTES[h]
      process.stdout.write(`  ${route.name}... `)
      const batch = await fetchHighwayStations(ai, route)
      const newOnly = batch.filter((s) => {
        const key = stationKey(s)
        if (keySet.has(key)) return false
        keySet.add(key)
        return true
      })
      highwayStations.push(...newOnly)
      console.log(newOnly.length)
      if (h < HIGHWAY_ROUTES.length - 1) await delay(900)
    }
    if (highwayStations.length > 0) {
      console.log(`  Highway total: ${highwayStations.length} new stations`)
    }
  }

  const finalList = []
  const seen = new Set()
  for (const ci of CITIES) {
    const list = byCity[ci.city] || []
    for (const s of list) {
      const key = stationKey(s)
      if (seen.has(key)) continue
      seen.add(key)
      finalList.push(s)
    }
  }
  for (const s of highwayStations) {
    const key = stationKey(s)
    if (seen.has(key)) continue
    seen.add(key)
    finalList.push(s)
  }

  const outDir = resolve(root, 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'stations-myanmar.csv')
  const csv = [CSV_HEADER, ...finalList.map(rowToCsv)].join('\n')
  writeFileSync(outPath, csv, 'utf8')

  const citySummary = Object.entries(byCity)
    .map(([name, list]) => `${name}: ${list.length}`)
    .join(', ')
  const highwayNote = highwayStations.length > 0 ? `, highways: ${highwayStations.length}` : ''
  console.log(`\nWrote ${finalList.length} stations (${citySummary}${highwayNote}) to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
