#!/usr/bin/env node
/**
 * Build data/verified-stations.csv from distributor sources (name, address, township, city).
 * We only output physical coordinates when we have them. If we do not have coordinates,
 * we output empty lat,lng so stations are stored address-only and are NOT shown on the map
 * (they can be listed with "location not verified" until coordinates are added via geocoding).
 *
 * Run: node scripts/build-verified-stations.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const DATA_DIR = resolve(root, 'data')
const VERIFIED_SOURCES = resolve(DATA_DIR, 'verified-sources')
const MAX_CSV = resolve(DATA_DIR, 'verified-stations-max-energy.csv')
const DENKO_JSON = resolve(VERIFIED_SOURCES, 'denko-stations.json')
const BOC_JSON = resolve(VERIFIED_SOURCES, 'boc-stations.json')
const PT_POWER_JSON = resolve(VERIFIED_SOURCES, 'pt-power-stations.json')
const OUT = resolve(DATA_DIR, 'verified-stations.csv')

function escapeCsv(s) {
  if (s == null || s === '') return ''
  const t = String(s)
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

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

// ——— 1. Max Energy: read from CSV (build it first if missing) ———
if (!existsSync(MAX_CSV)) {
  console.log('Building Max Energy CSV first…')
  execSync('node scripts/build-verified-max-energy.mjs', { cwd: root, stdio: 'inherit' })
}
let rows = []
if (existsSync(MAX_CSV)) {
  const raw = readFileSync(MAX_CSV, 'utf8')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length > 1) {
    const header = parseCSVLine(lines[0])
    const nameIdx = header.indexOf('name')
    const latIdx = header.indexOf('lat')
    const lngIdx = header.indexOf('lng')
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i])
      if (cells[nameIdx]) rows.push(cells.join(','))
    }
  }
}

// ——— 2. Shwe Taung Tan (shwetaungtan.com/stations) ——— no physical coords, address only
const shweTaungTan = [
  { name: 'Shwe Taung Tan (Shwe Gu Station 2)', brand: 'Shwe Taung Tan', address: 'ငါးဘတ်ကြီးလမ်းဆုံ၊ ရွှေကူမြို့၊ ကချင်ပြည်နယ်', township: 'Shwegu', city: 'Shwegu' },
  { name: 'Shwe Taung Tan (Shwe Gu Station 3)', brand: 'Shwe Taung Tan', address: 'အမှတ်(၂)ရပ်ကွက်၊ သင်္ဘောဆိပ်၊ ရွှေကူမြို့', township: 'Shwegu', city: 'Shwegu' },
  { name: 'Shwe Taung Tan (Bhamo Station 4)', brand: 'Shwe Taung Tan', address: 'ဟန်းတဲရပ်ကွက်၊ ကန်တော်စျေးအနီး၊ ဗန်းမော်မြို့', township: 'Bhamo', city: 'Bhamo' },
  { name: 'Shwe Taung Tan (Bhamo Station 5)', brand: 'Shwe Taung Tan', address: 'မင်းကုန်းရပ်ကွက်၊ သိမ်တော်ကြီးဘုရားအနီး၊ ဗန်းမော်မြို့', township: 'Bhamo', city: 'Bhamo' },
  { name: 'Shwe Taung Tan (Bhamo Station 6)', brand: 'Shwe Taung Tan', address: 'ရွှေပြည်သာကျေးရွာ၊ သုံးမိုင်မြို့ရှောင်လမ်းအနီး၊ ဗန်းမော်မြို့', township: 'Bhamo', city: 'Bhamo' },
]
shweTaungTan.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 3. SPC / Shwe Taung Energy ——— address only
const spc = [
  { name: 'SPC (Sanchaung)', brand: 'SPC', address: 'Pyay Road & Dhammazedi Road, Sanchaung Township', township: 'Sanchaung', city: 'Yangon' },
]
spc.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 4. Htoo Petroleum ——— address only
const htoo = [
  { name: 'Htoo Petroleum (Ahlon)', brand: 'Htoo Petroleum', address: 'Near Htawligwayt, Strand Road, Ahlon Township', township: 'Ahlon', city: 'Yangon' },
  { name: 'Htoo Petroleum (Hlaing)', brand: 'Htoo Petroleum', address: 'No. 5 Pyay Road, Hlaing Township', township: 'Hlaing', city: 'Yangon' },
  { name: 'Htoo Petroleum (Sittwe)', brand: 'Htoo Petroleum', address: 'Kan Ner (Strand) Street, Sittwe', township: 'Sittwe', city: 'Sittwe' },
]
htoo.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 5. PTT ——— address only
const ptt = [
  { name: 'PTT (Myawaddy)', brand: 'PTT', address: 'Bayint Naung Road, Myawaddy', township: 'Myawaddy', city: 'Myawaddy' },
]
ptt.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 6. Denko (denkomyanmar.com/stations) ——— address only, no coordinates
if (existsSync(DENKO_JSON)) {
  const denkoList = JSON.parse(readFileSync(DENKO_JSON, 'utf8'))
  const brand = 'Denko'
  denkoList.forEach((s) => {
    const township = (s.township || '').trim()
    const region = (s.region || '').trim()
    const city = region || township
    rows.push([escapeCsv(s.name), escapeCsv(brand), '', '', escapeCsv(s.address || ''), escapeCsv(township), escapeCsv(city), 'MM'].join(','))
  })
  console.log(`Added ${denkoList.length} Denko stations (address only) from ${DENKO_JSON}`)
} else {
  console.warn(`Denko list not found at ${DENKO_JSON}; skipping Denko stations.`)
}

// ——— 6b. BOC Best Oil Company (bocbestoilcompany.com) ——— address only
if (existsSync(BOC_JSON)) {
  const bocList = JSON.parse(readFileSync(BOC_JSON, 'utf8'))
  const brand = 'BOC'
  bocList.forEach((s) => {
    const township = (s.township || '').trim()
    const region = (s.region || '').trim()
    const city = region || township
    rows.push([escapeCsv(s.name), escapeCsv(brand), '', '', escapeCsv(s.address || ''), escapeCsv(township), escapeCsv(city), 'MM'].join(','))
  })
  console.log(`Added ${bocList.length} BOC stations (address only) from ${BOC_JSON}`)
} else {
  console.warn(`BOC list not found at ${BOC_JSON}; skipping BOC stations.`)
}

// ——— 6c. PT Power Service Station (BOC) ——— address only
if (existsSync(PT_POWER_JSON)) {
  const ptList = JSON.parse(readFileSync(PT_POWER_JSON, 'utf8'))
  const brand = 'PT Power'
  ptList.forEach((s) => {
    const township = (s.township || '').trim()
    const region = (s.region || '').trim()
    const city = region || township
    rows.push([escapeCsv(s.name), escapeCsv(brand), '', '', escapeCsv(s.address || ''), escapeCsv(township), escapeCsv(city), 'MM'].join(','))
  })
  console.log(`Added ${ptList.length} PT Power stations (address only) from ${PT_POWER_JSON}`)
} else {
  console.warn(`PT Power list not found at ${PT_POWER_JSON}; skipping PT Power stations.`)
}

// ——— 7. New Day Energy ——— address only
const newDay = [
  { name: 'New Day (Sanchaung)', brand: 'New Day', address: 'Baho Rd., Corner of Shan Lane, Kyun Taw South Ward, Sanchaung Township', township: 'Sanchaung', city: 'Yangon' },
  { name: 'New Day (Mayangon)', brand: 'New Day', address: '274, Kaba Aye Pagoda Rd., Near Marina Residence, Ward 10, Mayangone Township', township: 'Mayangon', city: 'Yangon' },
  { name: 'New Day (Pyinmana)', brand: 'New Day', address: 'Old Yangon-Mandalay Highway, Pyinmana', township: 'Pyinmana', city: 'Naypyidaw' },
]
newDay.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 8. KZH Petro ——— address only
const kzh = [
  { name: 'KZH Petro Station (Mandalay)', brand: 'KZH', address: '411, 84th St., Between 38th and 39th St., Maha Aung Myay Township, Mandalay', township: 'Maha Aung Myay', city: 'Mandalay' },
]
kzh.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 9. Puma Energy Asia Sun ——— address only
const puma = [
  { name: 'Puma Energy Asia Sun (Thilawa)', brand: 'Puma Energy', address: 'Thilawa SEZ, Thilawa port, Yangon', township: 'Thanlyin', city: 'Yangon' },
]
puma.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 10. Nilar ——— address only
const nilar = [
  { name: 'Nilar (Mandalay)', brand: 'Nilar', address: 'Rm-5, 89th St., Between 22nd and 23rd St., Thiri Mingalar Car Compound, Mandalay', township: 'Mandalay', city: 'Mandalay' },
]
nilar.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

// ——— 11. Myawaddy Trading ——— address only
const myawaddyTrading = [
  { name: 'Myawaddy Trading (Seikkan)', brand: 'Myawaddy Trading', address: 'No. 55/61, Strand Road, Seikkan Township, Yangon', township: 'Dagon Seikkan', city: 'Yangon' },
]
myawaddyTrading.forEach((s) => {
  rows.push([escapeCsv(s.name), escapeCsv(s.brand), '', '', escapeCsv(s.address), escapeCsv(s.township), escapeCsv(s.city), 'MM'].join(','))
})

const header = 'name,brand,lat,lng,address_text,township,city,country_code'
const csv = [header, ...rows].join('\n')
writeFileSync(OUT, csv, 'utf8')
console.log(`Wrote ${rows.length} stations to ${OUT} (all address-only; no coordinates = not shown on map until geocoded).`)
