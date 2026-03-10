# Verified fuel station sourcing — distributor-led approach

## The problem

- **Government figures:** Myanmar has ~**2,576–2,642** registered filling stations (PPRD, 2019–2020). Some sources cite ~2,737 as of 2020.
- **Our DB:** We had 6,400+ active stations — roughly **2× the official count** — so a large share is duplicate, wrong, or AI-hallucinated.
- **Examples of bad data:** Stations plotted inside the Mandalay Palace compound; wrong or fabricated locations.
- **Impact:** Users and B2B customers lose trust; we cannot monetize reliably until the map is trustworthy.

## Approach: verified distributor networks first

Build a **verified layer** of 200–300+ stations from **official distributor sources** (websites, branch lists). These are:

- Real, named branches (e.g. “Max Energy (Ahlone)”).
- Published by the brand (website, PDF, store locator).
- Recognizable to users and suitable for “Verified” or “From distributor” badges.

Then:

- Prefer verified stations in search and map (or allow filter “Verified only”).
- Keep improving coverage by adding more distributors and geocoding their addresses.
- Phase out or down-rank unverified/AI-sourced points as we replace them.

---

## Top 10 fuel distributors in Myanmar (for verified sourcing)

| # | Distributor / brand | Est. stations | Source / notes |
|---|----------------------|---------------|----------------|
| 1 | **Max Energy** | 77+ | [maxenergy.com.mm/stations](https://www.maxenergy.com.mm/stations/) — full list with names and Burmese addresses by region. |
| 2 | **Denko** (Eden Group) | 120+ (2023) | Major importer; 120 petroleum stations; need to find official branch list or store locator. |
| 3 | **Myawaddy Trading** | Large network | One of the largest importers; need official station list. |
| 4 | **Shwe Taung / SPC** (Singapore Petroleum) | 15+ | SPC-branded stations; Yangon, Bago, Mandalay, Sagaing. |
| 5 | **Puma Energy Asia Sun** | Growing | Terminals and retail; check Puma/Asia Sun for station list. |
| 6 | **Htoo Trading** | Widespread | Need official branch or station list. |
| 7 | **PTT** (Thailand) | Present in Myanmar | Check PTT Myanmar or regional site for station locator. |
| 8 | **Nilar Yoma** | Private network | Need official list. |
| 9 | **KZH** | Chain | Need official list. |
| 10 | **New Day** | Multiple locations | Need official list. |

**State / government-linked:**  
- **MPE (Myanmar Petroleum Products Enterprise)** — many former MPE stations were privatised; any official list would help.

---

## Data we have today

All verified stations are built into **`data/verified-stations.csv`** via:

```bash
npm run build-verified-stations   # builds from all sources below
npm run import-verified-stations  # imports into Supabase
```

| Distributor | Count | Source |
|-------------|-------|--------|
| **Max Energy** | 78 | [maxenergy.com.mm/stations](https://www.maxenergy.com.mm/stations/) — names and Burmese addresses by region. |
| **Shwe Taung Tan** | 5 | [shwetaungtan.com/stations](http://shwetaungtan.com/stations) — Shwe Gu (2, 3), Bhamo (4, 5, 6), Kachin. |
| **SPC (Shwe Taung Energy)** | 1 | First SPC-branded station: Sanchaung, Pyay Rd & Dhammazedi Rd, Yangon. |
| **Htoo Petroleum** | 3 | Known locations: Ahlon (Strand Rd), Hlaing (Pyay Rd), Sittwe (Kan Ner St). |
| **PTT** | 1 | Myawaddy (Bayint Naung Rd); 4+ stations in Myanmar, list not public. |
| **Denko** | 4 | [automobiledirectory.com.mm](https://www.automobiledirectory.com.mm) — Bahan (U Wisara Rd), Mandalay (Theikpan, 78th St, 62nd St). 120 total; add more when list available. |
| **New Day** | 3 | [automobiledirectory.com.mm](https://www.automobiledirectory.com.mm) — Sanchaung (Baho Rd), Mayangon (Kaba Aye Pagoda Rd), Pyinmana (old Yangon–Mandalay hwy). |
| **KZH** | 1 | [myanmaryellowpages.biz](https://myanmaryellowpages.biz) — Mandalay (84th St, Maha Aung Myay). |
| **Puma Energy** | 1 | Thilawa SEZ terminal / retail, Yangon. |
| **Nilar** | 1 | [myanmaryp.com](https://www.myanmaryp.com) — Mandalay (89th St, Thiri Mingalar). |
| **Myawaddy Trading** | 1 | [myawaddytrade.com](https://www.myawaddytrade.com) — Strand Rd, Seikkan Township, Yangon. |

**Map rule:** We only show a station on the map when we have **physical coordinates**. We do not invent or approximate. We use **Google Maps only** for geocoding: that is where fuel stations (Denko, BOC, Max, etc.) are already on the map; other maps have fewer stations. Take each address → look it up on Google Maps → if the station/address is there, use those coordinates. If it is not on Google Maps, leave lat/lng empty (address-only, not on map). "Verified" means: from an official list **and** coordinates from a real Google lookup, not "we know the town so we spread a pin."

**Pipeline:**
1. `npm run build-verified-stations` — builds CSV with name, address, township, city (no coordinates).
2. `npm run geocode-verified-stations` — for each row with an address, calls Google Geocoding API; fills lat/lng only when we get a result in Myanmar. Requires `GOOGLE_GEOCODING_API_KEY` or `GOOGLE_MAPS_API_KEY` in `.env`; enable [Geocoding API](https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com).
3. `npm run import-verified-stations` — imports the CSV; rows with coordinates get a map pin, rows without stay address-only (not on map).

---

## Next steps

1. **Denko:** We have 4 stations (Bahan, Mandalay x3); add the remaining ~116 when denkomyanmar.com or app list is available.
2. **SPC / Shwe Taung Energy:** Add more SPC-branded stations as locations are published (Sagaing, Mandalay, Naypyidaw were planned).
3. **PTT:** Add remaining PTT Myanmar stations when a store locator or list is available.
4. **KZH / Nilar Yoma / Myawaddy Trading:** Add more branches as directories or official lists are found.
5. **Geocoding:** Run geocoding on `address_text` for all rows and re-import so pins are accurate; consider a `data_source` or `is_verified_location` column in the DB.
3. **DB hygiene:**  
   - Do not re-activate stations in impossible locations (e.g. inside Mandalay Palace).  
   - Optionally add a `data_source` or `is_verified_location` column so we can filter or badge “verified by distributor”.
4. **App:** Keep “Verified only” filter and “Report wrong location”; consider a “Verified by [brand]” or “From distributor list” badge for these stations.

---

## References

- Government / PPRD: ~2,576–2,642 filling stations (2019), ~2,737 (2020).
- Max Energy: [Stations page](https://www.maxenergy.com.mm/stations/), corporate profile.
- Denko: Eden Group, 120 stations (2023).
- Shwe Taung / SPC: Distribution and SPC JV in Myanmar.
- ASEAN Energy / Reuters / Frontier Myanmar: market and operator overviews.
