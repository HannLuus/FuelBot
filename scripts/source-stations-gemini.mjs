#!/usr/bin/env node
/**
 * Source fuel stations in Yangon and Mandalay via Gemini API and write CSV.
 *
 * Requires GEMINI_API_KEY in environment or in .env (project root).
 * Run: npm run source-stations
 * Or:  GEMINI_API_KEY=your_key node scripts/source-stations-gemini.mjs
 *
 * Output: data/stations-yangon-mandalay.csv
 */

import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
dotenv.config({ path: resolve(root, '.env') })

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY. Set it in .env or run: GEMINI_API_KEY=your_key npm run source-stations')
  process.exit(1)
}

// Target minimum counts (script will do supplement pass if below these)
const TARGET_YANGON = 100
const TARGET_MANDALAY = 70

// Townships to query per city (improves coverage vs one prompt per city)
const YANGON_TOWNSHIPS = [
  'Ahlon', 'Bahan', 'Botahtaung', 'Dagon', 'Dagon Seikkan', 'Dala', 'Dawbon', 'Hlaing', 'Hlaingthaya',
  'Insein', 'Kamayut', 'Kyauktada', 'Kyeemyindaing', 'Lanmadaw', 'Latha', 'Mayangon', 'Mingaladon',
  'Mingala Taungnyunt', 'North Dagon', 'North Okkalapa', 'Pabedan', 'Pazundaung', 'Seikkyi Kanaungto',
  'Shwepyitha', 'South Dagon', 'South Okkalapa', 'Tamwe', 'Thaketa', 'Thingangyun', 'Yankin',
]
const MANDALAY_TOWNSHIPS = [
  'Amarapura', 'Aungmyethazan', 'Chan Aye Thar Zan', 'Chanmyathazi', 'Maha Aungmye', 'Patheingyi', 'Pyigyidagun',
]

// Myanmar approximate bounds for validation
const MYANMAR_LAT_MIN = 9.5
const MYANMAR_LAT_MAX = 28.5
const MYANMAR_LNG_MIN = 92.0
const MYANMAR_LNG_MAX = 101.0

const CSV_HEADER = 'name,brand,lat,lng,address_text,township,city,country_code'

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
  const lat = parseNumber(raw.lat, city === 'Yangon' ? 16.8661 : 21.9588)
  const lng = parseNumber(raw.lng, city === 'Yangon' ? 96.1561 : 96.0891)
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

function buildTownshipPrompt(township, city) {
  return `List ALL known fuel/gas/petrol filling stations in ${township} township, ${city}, Myanmar. Include every station you know: name, brand (e.g. MPE, Shwe Taung, Total, PTT, CNPC, or empty string), approximate latitude, approximate longitude, address or road name if known. Use township "${township}" for each. Return ONLY a valid JSON array of objects with exactly these keys: name, brand, lat, lng, address_text, township. No other text or markdown. Aim for a comprehensive list (at least 3–15 stations per township if they exist). Example: [{"name":"Station Name","brand":"MPE","lat":16.86,"lng":96.15,"address_text":"Road Name","township":"${township}"}]`
}

function buildSupplementPrompt(city, existingNames, targetCount) {
  const sample = existingNames.slice(0, 25).join(', ')
  return `We are building a comprehensive list of fuel/gas stations in ${city}, Myanmar. We already have these (and more): ${sample}. List ADDITIONAL fuel stations in ${city} that you have NOT listed above. Include name, brand, lat, lng, address_text, township. Return ONLY a valid JSON array. Add at least ${Math.min(30, targetCount)} more different stations. No other text or markdown. Keys: name, brand, lat, lng, address_text, township.`
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchStationsFromPrompt(ai, city, prompt) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  })
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

function dedupeStations(stations) {
  const seen = new Set()
  return stations.filter((s) => {
    const key = `${s.name}|${s.lat.toFixed(5)}|${s.lng.toFixed(5)}|${s.city}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function fetchCityByTownships(ai, city, townships) {
  const all = []
  for (let i = 0; i < townships.length; i++) {
    const township = townships[i]
    process.stdout.write(`  ${township}... `)
    const prompt = buildTownshipPrompt(township, city)
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
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })

  console.log(`Fetching stations in Yangon (${YANGON_TOWNSHIPS.length} townships)...`)
  let yangon = await fetchCityByTownships(ai, 'Yangon', YANGON_TOWNSHIPS)
  console.log(`  Yangon total so far: ${yangon.length}`)

  for (let round = 1; yangon.length < TARGET_YANGON && round <= 2; round++) {
    console.log(`  Supplement round ${round} (target ${TARGET_YANGON})...`)
    await delay(1000)
    const extra = await supplementCity(ai, 'Yangon', yangon, TARGET_YANGON)
    yangon = dedupeStations([...yangon, ...extra])
    console.log(`  Yangon after supplement: ${yangon.length}`)
  }

  await delay(1200)

  console.log(`\nFetching stations in Mandalay (${MANDALAY_TOWNSHIPS.length} townships)...`)
  let mandalay = await fetchCityByTownships(ai, 'Mandalay', MANDALAY_TOWNSHIPS)
  console.log(`  Mandalay total so far: ${mandalay.length}`)

  for (let round = 1; mandalay.length < TARGET_MANDALAY && round <= 2; round++) {
    console.log(`  Supplement round ${round} (target ${TARGET_MANDALAY})...`)
    await delay(1000)
    const extra = await supplementCity(ai, 'Mandalay', mandalay, TARGET_MANDALAY)
    mandalay = dedupeStations([...mandalay, ...extra])
    console.log(`  Mandalay after supplement: ${mandalay.length}`)
  }

  const all = dedupeStations([...yangon, ...mandalay])

  const outDir = resolve(root, 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'stations-yangon-mandalay.csv')
  const csv = [CSV_HEADER, ...all.map(rowToCsv)].join('\n')
  writeFileSync(outPath, csv, 'utf8')

  console.log(`\nWrote ${all.length} stations (Yangon: ${yangon.length}, Mandalay: ${mandalay.length}) to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
