#!/usr/bin/env node
/**
 * Build data/verified-stations-max-energy.csv from Max Energy's official station list.
 * Source: https://www.maxenergy.com.mm/stations/
 *
 * We do NOT have physical coordinates for these stations — only name and address.
 * Output has empty lat,lng so they are stored as address-only and never shown on the map
 * until coordinates are added (e.g. via geocoding of address_text).
 *
 * Run: node scripts/build-verified-max-energy.mjs
 */

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const OUT = resolve(root, 'data', 'verified-stations-max-energy.csv')

// Parsed from maxenergy.com.mm/stations (name, address, city). No coordinates — address only.
const STATIONS = [
  { name: 'Max Energy (Thein Phyu)', address: 'အမှတ်(၁၂၂)၊သိမ်ဖြူလမ်းမကြီး၊ မင်္ဂလာတောင်ညွန့်မြို့နယ်။', city: 'Yangon', township: 'Mingala Taungnyunt' },
  { name: 'Max Energy (Kyun Taw)', address: 'ဟံသာဝတီလမ်းနှင့်ကျွန်းတောလမ်းဒေါင့်၊ ကမာရွတ်မြို့နယ်။', city: 'Yangon', township: 'Kamayut' },
  { name: 'Max Energy (Ahlone)', address: 'ကမ်းနားလမ်းနှင့်အလုံလမ်းဒေါင့်၊ အလုံမြို့နယ်။', city: 'Yangon', township: 'Ahlon' },
  { name: 'Max Energy (Tamwe)', address: 'ကျိုက္ကဆံလမ်း၊ တာမွေအခွန်လွတ် ဈေးဘေး။', city: 'Yangon', township: 'Tamwe' },
  { name: 'Max Energy (Bahan)', address: 'အမှတ်(၇၆)၊ ဗဟန်းမြို့နယ်။', city: 'Yangon', township: 'Bahan' },
  { name: 'Max Energy (Thuwanna)', address: 'သင်္ဃန်းကျွန်းမြို့နယ်။', city: 'Yangon', township: 'Thingangyun' },
  { name: 'Max Energy (Tharkayta)', address: 'မင်းနန္ဒာလမ်းနှင့်ဧရာဝဏ်လမ်းထောင့်။', city: 'Yangon', township: 'Thaketa' },
  { name: 'Max Energy (Aung Mingalar)', address: 'အောင်မင်္ဂလာအဝေးပြေးဝင်း။', city: 'Yangon', township: 'Mingaladon' },
  { name: 'Max Energy (Padauk Chaung)', address: 'ဘုရင့်နောင်လမ်းမကြီး၊ လှိုင်မြို့နယ်။', city: 'Yangon', township: 'Hlaing' },
  { name: 'Max Energy (Dagon Ayar)', address: 'ဒဂုံ-ဧရာအဝေးပြေးဝင်း၊ လှိုင်သာယာမြို့နယ်။', city: 'Yangon', township: 'Hlegu' },
  { name: 'Max Energy (South Okkalapa)', address: 'တောင်ဥက္ကလာပမြို့နယ်။', city: 'Yangon', township: 'South Okkalapa' },
  { name: 'Max Energy (Hlegu-1)', address: 'ရန်ကုန်-ပဲခူး ကားလမ်း၊ လှိုင်မြို့နယ်။', city: 'Yangon', township: 'Hlegu' },
  { name: 'Max Energy (Hlegu-2)', address: 'ရန်ကုန်-ပဲခူး ကားလမ်း၊ လှိုင်မြို့နယ်။', city: 'Yangon', township: 'Hlegu' },
  { name: 'Max Energy (Sin Ma Lite)', address: 'ဘုရင့်နောင်လမ်း၊ ကမာရွတ်မြို့နယ်။', city: 'Yangon', township: 'Kamayut' },
  { name: 'Max Energy (Hmawbi-1)', address: 'ရန်ကုန်-ပြည်ကားလမ်း၊ မှော်ဘီမြို့နယ်။', city: 'Yangon', township: 'Hmawbi' },
  { name: 'Max Energy (Hmawbi-2)', address: 'မှော်ဘီမြို့နယ်။', city: 'Yangon', township: 'Hmawbi' },
  { name: 'Max Energy (Hmawbi-3)', address: 'မှော်ဘီခရိုင်၊ ရန်ကုန်တိုင်းဒေသကြီး။', city: 'Yangon', township: 'Hmawbi' },
  { name: 'Max Energy (Lay Daungkan)', address: 'ဒဂုံမြို့သစ်တောင်ပိုင်းမြို့နယ်။', city: 'Yangon', township: 'South Dagon' },
  { name: 'Max Energy (Shwepyithar)', address: 'ရွှေပြည်သာ။', city: 'Yangon', township: 'Shwepyitha' },
  { name: 'Max Energy (Mingaladon – Pyin Ma Pin)', address: 'မင်္ဂလာဒုံမြို့နယ်။', city: 'Yangon', township: 'Mingaladon' },
  { name: 'Max Energy (Dala)', address: 'ဒလ-တွံတေးကားလမ်း၊ ဒလမြို့နယ်။', city: 'Yangon', township: 'Dala' },
  { name: 'Max Energy (North Dagon)', address: 'ဒဂုံမြို့သစ် (မြောက်ပိုင်း) မြို့နယ်။', city: 'Yangon', township: 'North Dagon' },
  { name: 'Max Energy (Kamarkyi)', address: 'သန်လျင်တံတားချဉ်းကပ်လမ်း၊ သာကေတ မြို့နယ်။', city: 'Yangon', township: 'Thanlyin' },
  { name: 'Max Energy (Kawhmu)', address: 'ကော့မှုးမြို့နယ်။', city: 'Yangon', township: 'Kawhmu' },
  { name: 'Max Energy (Nwe Khway)', address: 'မင်္ဂလာဒုံမြို့နယ်။', city: 'Yangon', township: 'Mingaladon' },
  { name: 'Max Energy (Twantay)', address: 'တွံတေးမြို့နယ်။', city: 'Yangon', township: 'Twante' },
  { name: 'Max Energy (North Dagon-2)', address: 'ဒဂုံမြို့သစ်(မြောက်ပိုင်း)မြို့နယ်။', city: 'Yangon', township: 'North Dagon' },
  { name: 'Max Energy (Dagon Seikkan)', address: 'ဒဂုံမြို့သစ် (ဆိပ်ကမ်း) မြို့နယ်။', city: 'Yangon', township: 'Dagon Seikkan' },
  { name: 'Max Energy (Thilawa SEZ)', address: 'သီလဝါအထူးစီးပွားရေးဇုန်၊ သန်လျင်မြို့နယ်။', city: 'Yangon', township: 'Thanlyin' },
  { name: 'Max Energy (Nay Pyi Taw)', address: 'ဘောဂသီရိမြို့နယ်၊ နေပြည်တော်။', city: 'Naypyidaw', township: 'Ottarathiri' },
  { name: 'Max Energy (Taungsin Aye)', address: 'လယ်ဝေးမြို့နယ်၊ နေပြည်တော်။', city: 'Naypyidaw', township: 'Lewe' },
  { name: 'Max Energy (Nay Pyi Taw 3)', address: 'ဇေယျာသီရိမြို့နယ်၊ နေပြည်တော်။', city: 'Naypyidaw', township: 'Zeyarthiri' },
  { name: 'Max Energy (Nay Pyi Taw 4)', address: 'ဇေယျာသီရိမြို့နယ်၊ နေပြည်တော်။', city: 'Naypyidaw', township: 'Zeyarthiri' },
  { name: 'Max Energy (Mandalay-1)', address: '၈၄ လမ်း x ၃၂ လမ်းထောင့်၊ ချမ်းအေးသာဇံမြို့နယ်၊ မန္တလေး။', city: 'Mandalay', township: 'Chan Aye Thar Zan' },
  { name: 'Max Energy (Mandalay-2)', address: 'နတ်ရေကန်ရပ်ကွက်၊ (၆၈)လမ်း၊ အမရပူရမြို့နယ်။', city: 'Mandalay', township: 'Amarapura' },
  { name: 'Max Energy (Mandalay-4)', address: 'ပြည်ကြီးတံခွန်မြို့နယ်။', city: 'Mandalay', township: 'Patheingyi' },
  { name: 'Max Energy (Mandalay-5)', address: 'မဟာအောင်မြေမြို့နယ်၊ မန္တလေး။', city: 'Mandalay', township: 'Maha Aungmye' },
  { name: 'Max Energy (Mandalay-6)', address: 'ချမ်းမြသာစည်မြို့နယ်၊ မန္တလေး။', city: 'Mandalay', township: 'Chanmyathazi' },
  { name: 'Max Energy (Meiktila-1)', address: 'မိတ္ထီလာမြို့နယ်။', city: 'Meiktila', township: 'Meiktila' },
  { name: 'Max Energy (Meiktila-2)', address: 'မိတ္ထီလာ – မြင်းခြံကားလမ်း။', city: 'Meiktila', township: 'Meiktila' },
  { name: 'Max Energy (Meiktila-3)', address: 'မိတ္ထီလာမြို့။', city: 'Meiktila', township: 'Meiktila' },
  { name: 'Max Energy (Meiktila-4)', address: 'မိတ္ထီလာမြို့နယ်။', city: 'Meiktila', township: 'Meiktila' },
  { name: 'Max Energy (Sintgaing)', address: 'စဉ့်ကိုင်မြို့နယ်၊ ကျောက်ဆည်ခရိုင်။', city: 'Mandalay', township: 'Sintgaing' },
  { name: 'Max Energy (Kyaukse)', address: 'ကျောက်ဆည်မြို့နယ်။', city: 'Kyaukse', township: 'Kyaukse' },
  { name: 'Max Energy (Kyaukpadaung)', address: 'ကျောက်ပန်းတောင်းမြို့နယ်။', city: 'Mandalay', township: 'Nyaung-U' },
  { name: 'Max Energy (Mahlaing)', address: 'မလှိုင်မြို့နယ်၊ မိတ္ထီလာခရိုင်။', city: 'Meiktila', township: 'Mahlaing' },
  { name: 'Max Energy (Nyaung-U)', address: 'ညောင်ဦးမြို့နယ်။', city: 'Nyaung-U', township: 'Nyaung-U' },
  { name: 'Max Energy (Ongyaw)', address: 'ပုသိမ်ကြီးမြို့နယ်၊ မန္တလေး။', city: 'Mandalay', township: 'Patheingyi' },
  { name: 'Max Energy (Thaton)', address: 'သထုံမြို့။', city: 'Mawlamyine', township: 'Thaton' },
  { name: 'Max Energy (Moke Ta Ma)', address: 'ပေါင်မြို့။', city: 'Mawlamyine', township: 'Mawlamyine' },
  { name: 'Max Energy (Mawlamyine)', address: 'မော်လမြိုင်မြို့နယ်။', city: 'Mawlamyine', township: 'Mawlamyine' },
  { name: 'Max Energy (Bago)', address: 'ပဲခူးမြို့။', city: 'Bago', township: 'Bago' },
  { name: 'Max Energy (Inntakaw)', address: 'ရန်ကုန်-မန္တလေးကားလမ်းဘေး၊ ပဲခူးမြို့။', city: 'Bago', township: 'Bago' },
  { name: 'Max Energy (Thet Ka La)', address: 'ကဝမြို့နယ်၊ ပဲခူးမြို့။', city: 'Bago', township: 'Kawa' },
  { name: 'Max Energy (Thanatpin)', address: 'သနပ်ပင်မြို့နယ်။', city: 'Bago', township: 'Thanatpin' },
  { name: 'Max Energy (Oktwin)', address: 'အုတ်တွင်းမြို့နယ်၊ ပဲခူးတိုင်း။', city: 'Taungoo', township: 'Oktwin' },
  { name: 'Max Energy (Tharyawaddy)', address: 'သာယာဝတီမြို့နယ်။', city: 'Tharrawaddy', township: 'Tharrawaddy' },
  { name: 'Max Energy (Pyuntaza)', address: 'ညောင်လေးပင်မြို့နယ်၊ ပဲခူးတိုင်း။', city: 'Bago', township: 'Bago' },
  { name: 'Max Energy (Phayarkalay)', address: 'ပဲခူးမြို့နယ်။', city: 'Bago', township: 'Bago' },
  { name: 'Max Energy (108 Mile)', address: 'ဖြူးမြို့နယ်၊ တောင်ငူ။', city: 'Taungoo', township: 'Taungoo' },
  { name: 'Max Energy (Taungoo)', address: 'အုတ်တွင်းမြို့နယ်၊ တောင်ငူခရိုင်။', city: 'Taungoo', township: 'Taungoo' },
  { name: 'Max Energy (Pathein-1)', address: 'ပုသိမ်မြို့။', city: 'Pathein', township: 'Pathein' },
  { name: 'Max Energy (Pathein-2)', address: 'ပုသိမ်မြို့။', city: 'Pathein', township: 'Pathein' },
  { name: 'Max Energy (Pathein 3)', address: 'ပုသိမ်မြို့နယ်။', city: 'Pathein', township: 'Pathein' },
  { name: 'Max Energy (Hinthada)', address: 'ဟင်္သာတမြို့။', city: 'Hinthada', township: 'Hinthada' },
  { name: 'Max Energy (Pantanaw)', address: 'ပန်းတနော်မြို့။', city: 'Pathein', township: 'Pantanaw' },
  { name: 'Max Energy (Yegyi)', address: 'ရေကြည်မြို့နယ်။', city: 'Pathein', township: 'Pathein' },
  { name: 'Max Energy (Kyonpyaw)', address: 'ကျုံပျော်မြို့နယ်။', city: 'Pathein', township: 'Kyonpyaw' },
  { name: 'Max Energy (Ngathaingchaung)', address: 'ငါးသိုင်းချောင်းမြို့နယ်ခွဲ။', city: 'Pathein', township: 'Pathein' },
  { name: 'Max Energy (Chaungtha)', address: 'ချောင်းသာကျေးရွာ၊ ပုသိမ်မြို့နယ်။', city: 'Pathein', township: 'Pathein' },
  { name: 'Max Energy (Nyaung Don)', address: 'ညောင်တုန်းမြို့။', city: 'Pathein', township: 'Nyaungdon' },
  { name: 'Max Energy (Ingapu)', address: 'အင်္ဂပူမြို့နယ်။', city: 'Hinthada', township: 'Ingapu' },
  { name: 'Max Energy (Myinmu)', address: 'မြင်းမူမြို့နယ်၊ စစ်ကိုင်းတိုင်းဒေသကြီး။', city: 'Myinmu', township: 'Myinmu' },
  { name: 'Max Energy (Magway)', address: 'မကွေးမြို့နယ်။', city: 'Magway', township: 'Magway' },
  { name: 'Max Energy (Magway-2)', address: 'မကွေးမြို့နယ်။', city: 'Magway', township: 'Magway' },
  { name: 'Max Energy (Magway-3)', address: 'မြို့သစ်မြို့နယ်၊ မကွေးတိုင်းဒေသကြီး။', city: 'Magway', township: 'Magway' },
  { name: 'Max Energy (Taunggyi)', address: 'တောင်ကြီးမြို့။', city: 'Taunggyi', township: 'Taunggyi' },
  { name: 'Max Energy (Heho)', address: 'ဟဲဟိုးမြို့၊ ရှမ်းပြည်နယ်။', city: 'Taunggyi', township: 'Heho' },
]

function escapeCsv(s) {
  if (s == null || s === '') return ''
  const t = String(s)
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

// No coordinates — we only have name/address from the list. Empty lat,lng = address-only, not on map.
const rows = STATIONS.map((s) => {
  return [
    escapeCsv(s.name),
    escapeCsv('Max Energy'),
    '',
    '',
    escapeCsv(s.address),
    escapeCsv(s.township || '—'),
    escapeCsv(s.city),
    'MM',
  ].join(',')
})

const header = 'name,brand,lat,lng,address_text,township,city,country_code'
const csv = [header, ...rows].join('\n')
writeFileSync(OUT, csv, 'utf8')
console.log(`Wrote ${STATIONS.length} Max Energy stations (address-only, no coordinates).`)
