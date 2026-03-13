# Myanmar station names and fixing duplicate locations

## How station names and locations work

Many verified stations (e.g. Denko) use a **naming pattern** that encodes brand, street/area, and city:

- **Format:** `BRAND, <street_or_area>_<number>_ _ <CITY_ABBREV>` or similar.
- **City abbreviations** (common in names):
  - **MDY** = Mandalay  
  - **YGN** = Yangon  
  - **BGO** = Bago  
  - **AYY** = Ayeyarwady  
  - **SGG** = Sagaing  
  - **MON** = Mon  
  - **RKE** = Rakhine  
  - **SHN** = Shan  
  - **NPW** = Naypyitaw  
  - **KYN** = Kayin  
  - **KCN** = Kachin  
  - **KYH** = Kayah  
  - **MGY** = Magway  

- **Street patterns:** e.g. `12St` = 12th Street, `19St` = 19th Street, `62St` = 62nd Street, `78St` = 78th Street. Extra text (e.g. `Khinsawmu`) often refers to township or area.
- **Suburb / township in the name:** Names can include a suburb or township so the location is unambiguous.
  - **Nan Oo Lwin** (NanOoLwin) is a **parish/community within Patheingyi Township**, on the **eastern outskirts** of Mandalay (not to be confused with Pyin Oo Lwin). **Patheingyi Township** is east of central Mandalay (bounded by Aungmyethazan/Chanayethazan to the west) and is still part of Mandalay’s expansion.
  - **Central Mandalay** uses a numbered grid: streets run roughly north–south (e.g. 9th–45th) and east–west (50th–90th). So **26th Street & 70th Street** is in the **city centre**, not in Nan Oo Lwin or Patheingyi. For a station named “NanOoLwin … 26St” with township Patheingyi, the correct location is **26th Street in the Nan Oo Lwin / Patheingyi area (outskirts)**; the geocode query must include **Nan Oo Lwin** and **Patheingyi** so Google returns that area, not central 26th Street.

**Examples:**

| Name in DB | Meaning |
|------------|--------|
| DENKO, 12St_01__MDY | Denko station on 12th Street, Mandalay |
| DENKO, 19St_01__MDY | Denko station on 19th Street, Mandalay |
| DENKO, 78St_01_ Khinsawmu_MDY | Denko station on 78th Street, Khinsawmu area, Mandalay |
| DENKO, NanOoLwin_01 _ 26St _ MDY | Denko station at 26th Street, Nan Oo Lwin (suburb), Patheingyi township, Mandalay — combine “Nan Oo Lwin 26 Patheingyi Mandalay” to pin the location |

## Duplicate stations with wrong locations

When the **same station name** appears more than once with **different coordinates**, those are duplicates: only one physical place exists. The map then shows multiple pins for one station, and at least one pin is wrong.

**Correct approach:**

1. **Identify** duplicates: same name (and same city/brand), different `lat`/`lng`.
2. **Resolve** the true location using **Google Maps** as the source of truth:
   - Search for the station in plain terms, e.g. **“Denko 12th Street Mandalay”** or **“Denko 19th Street Mandalay”**.
   - Google Maps returns **one** place for that station.
3. **Update data:** set the **correct** coordinates (from Google) on **one** record and **remove** the other duplicate row(s), so there is a single pin in the right place.

We use **Google Maps only** for this because that is where fuel stations (Denko, BOC, Max, etc.) are already on the map; we do not invent or approximate coordinates.

## Manually corrected coordinates (do not overwrite)

Stations whose coordinates were **manually corrected** from Google Maps must **not** be overwritten by bulk scripts (apply location updates, discovery ingest). Otherwise a later Places run or apply can replace the correct pin with a wrong one.

**Locked list:** `data/coordinates-locked-station-ids.json` — array of station UUIDs. Both `apply-mandalay-location-updates.mjs` and `discover-and-ingest-by-region.mjs` skip updating `lat`/`lng` for these IDs. When you correct a station’s coordinates in the DB (e.g. from Google Maps), add its `id` to this file so future runs do not overwrite it.

Current locked: Denko 26th St (Nan Oo Lwin) Mandalay; BOC 78 Mandalay.

## Look up correct coordinates (Text Search → update DB)

**Preferred way to set coordinates:** one Places API **Text Search** per station (same as typing the station name in Google Maps), then update that station’s `lat`/`lng` in the database. The search text **always includes the brand** (e.g. Denko) so Google returns that brand’s place.

- **Script:** `node scripts/lookup-coordinates-by-text-search.mjs [--dry-run] [--city=Mandalay] [--brand=Denko]`
- **npm:** `npm run lookup-coordinates -- --city=Mandalay --brand=Denko --dry-run`
- Reads stations from Supabase, builds a human-like query (brand + location + city), calls Text Search once per station, updates the DB with the result. Skips stations listed in `data/coordinates-locked-station-ids.json`.
- Use `--dry-run` first to see queries and would-be coordinates; omit it to apply updates.

## Scripts

- **Find name-duplicates (same name, different coords):**  
  `node scripts/find-name-duplicates.mjs`  
  Lists groups of stations that share the same name but have different lat/lng.

- **Fix duplicates using Google Geocoding:**  
  `node scripts/fix-duplicate-locations-with-google.mjs [--dry-run] [--apply]`  
  For each duplicate group, builds a search string (e.g. “Denko 12th Street Mandalay Myanmar”), calls the Google Geocoding API, and either reports suggested coordinates or (with `--apply`) updates the DB: one row gets the correct coords, the others are removed.

**Denko Mandalay (Places Nearby Search):** `node scripts/denko-mandalay-places.mjs` — fetches gas stations in Mandalay via Places API (New) Nearby Search, filters to Denko, matches to `data/mandalay-stations.json` by street/area, writes `data/mandalay-location-updates.json`. For **all brands** (BOC, PT Power, Max Energy, Asia Energy): run `fetch-mandalay-stations.mjs` then `mandalay-all-brands-places.mjs`. **Requires Places API (New) enabled** in Google Cloud Console; if not enabled, the script prints how to enable it. If you can’t enable it, use `fix-mandalay-locations.mjs` and correct coords from Google Maps.

**Getting exact locations:** The API often returns different results than Google Maps. For exact coords, search the same query in Maps and paste lat/lng into the updates JSON, then apply with `node scripts/apply-mandalay-location-updates.mjs` (or `--file=data/yangon-location-updates.json` for Yangon). Apply runs one-by-one to Supabase.

Requires `GOOGLE_GEOCODING_API_KEY` or `GOOGLE_MAPS_API_KEY` in `.env` for the fix script.

---

## Yangon: township-by-township location updates

For large cities (Yangon, Mandalay), locations are fixed **per township** so coverage is complete and API limits (e.g. 20 places per Nearby Search) are not exceeded. Township names come from **data/Regions.csv**; township **centers are from geocoding** (not from CSV coordinates, which are not trusted as 100% accurate).

### Prerequisites

- **Regions.csv** — source of Yangon townships (Region = "Yangon").
- **Google Geocoding API** — to get township center (lat, lng) for each township.
- **Places API (New)** — enabled in Google Cloud Console for Nearby Search.

### Workflow (Yangon)

1. **Build township list and centers**  
   `node scripts/build-yangon-townships.mjs`  
   - Reads `data/Regions.csv`, filters Region = "Yangon", trims township names.  
   - Geocodes each township with `"<Township>, Yangon, Myanmar"`.  
   - Writes `data/yangon-townships-list.json` and `data/yangon-township-centers.json`.  
   - Township name normalization (e.g. Botataung → Botahtaung) is applied so DB township names can match.

2. **Fetch Yangon stations from Supabase**  
   `node scripts/fetch-yangon-stations.mjs`  
   - Queries stations where `city = 'Yangon'` and brand in Denko, BOC, PT Power, Max Energy, Asia Energy.  
   - Writes `data/yangon-stations-all.json`.

3. **Run Places API per township and match**  
   `node scripts/yangon-by-township-places.mjs`  
   - For each township with a geocoded center and at least one station: runs one Nearby Search (gas_station, 4 km radius, max 20 results).  
   - Filters places by brand; matches places to stations (same brand + name/address scoring).  
   - Appends all matches to a single `data/yangon-location-updates.json` (no duplicate station IDs).

4. **Review and correct**  
   - Open `data/yangon-location-updates.json`.  
   - Spot-check entries (e.g. one per district). For any station with no match or a wrong match, look up the station on **Google Maps**, copy coordinates from the URL or place card, and add or overwrite `lat`/`lng` for that `id` in the JSON.

5. **Apply to Supabase**  
   - Dry-run: `node scripts/apply-mandalay-location-updates.mjs --file=data/yangon-location-updates.json --dry-run`  
   - Apply: `node scripts/apply-mandalay-location-updates.mjs --file=data/yangon-location-updates.json`  
   - Default (Mandalay): `node scripts/apply-mandalay-location-updates.mjs` uses `data/mandalay-location-updates.json`.

### Apply script (reusable)

`scripts/apply-mandalay-location-updates.mjs` accepts an optional file path:

- `node scripts/apply-mandalay-location-updates.mjs` — uses `data/mandalay-location-updates.json`.  
- `node scripts/apply-mandalay-location-updates.mjs --file=data/yangon-location-updates.json` — uses Yangon updates.  
- Add `--dry-run` to print what would be updated without writing to the database.

---

## Mandalay: township-by-township location updates

Same pattern as Yangon: townships from **data/Regions.csv** (Region = "Mandalay"), geocoded centers (not CSV coordinates), one Places Nearby Search per township, match by brand + township/area tokens, output for review then apply.

### Workflow (Mandalay)

1. **Build township list and centers**  
   `node scripts/build-mandalay-townships.mjs`  
   Writes `data/mandalay-townships-list.json` and `data/mandalay-township-centers.json`.

2. **Fetch Mandalay stations**  
   `node scripts/fetch-mandalay-stations.mjs`  
   Writes `data/mandalay-stations-all.json`.

3. **Run Places per township and match**  
   `node scripts/mandalay-by-township-places.mjs`  
   Writes `data/mandalay-location-updates.json`. Uses Mandalay-specific tokens (Nan Oo Lwin, Khinsawmu, Amarapura, Mandalay-N branch numbers).

4. **Review and apply**  
   Edit `data/mandalay-location-updates.json` if needed, then:  
   `node scripts/apply-mandalay-location-updates.mjs --file=data/mandalay-location-updates.json [--dry-run]`

---

## Naypyidaw: township-by-township

1. **Build townships:** `node scripts/build-naypyidaw-townships.mjs` → `data/naypyidaw-townships-list.json`, `data/naypyidaw-township-centers.json`  
2. **Fetch stations:** `node scripts/fetch-naypyidaw-stations.mjs` → `data/naypyidaw-stations-all.json`  
3. **Places + match:** `node scripts/naypyidaw-by-township-places.mjs` → `data/naypyidaw-location-updates.json`  
4. **Apply:** `node scripts/apply-mandalay-location-updates.mjs --file=data/naypyidaw-location-updates.json [--dry-run]`

---

## Bago: township-by-township

1. **Build townships:** `node scripts/build-bago-townships.mjs` → `data/bago-townships-list.json`, `data/bago-township-centers.json`  
2. **Fetch stations:** `node scripts/fetch-bago-stations.mjs` → `data/bago-stations-all.json` (city = 'Bago')  
3. **Places + match:** `node scripts/bago-by-township-places.mjs` → `data/bago-location-updates.json`  
4. **Apply:** `node scripts/apply-mandalay-location-updates.mjs --file=data/bago-location-updates.json [--dry-run]`

---

## Discovery: add new stations from Places API

Use the **discovery** script to find fuel stations (Denko, BOC, PT Power, Max Energy, Asia Energy) via Places API per township and **insert** them into the database when they are not already present. This complements the correction workflow (which only updates coordinates for existing rows).

### Command

From the project root (with `.env` containing `GOOGLE_GEOCODING_API_KEY` or `GOOGLE_MAPS_API_KEY`, and `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`):

```bash
npm run discover -- --region="<Region>" [--district=<District>] [--dry-run]
```

Or run the script directly:

```bash
node scripts/discover-and-ingest-by-region.mjs --region="<Region>" [--district=<District>] [--dry-run]
```

- **--region** — Region name as in [data/Regions.csv](data/Regions.csv) (e.g. `"Shan South"`, `"Ayeyarwady"`).
- **--district** — Optional. Limit to one district (e.g. `--district=Taunggyi` for Shan South).
- **--dry-run** — Do not insert or update; only report what would be done.

Requires: `GOOGLE_GEOCODING_API_KEY` or `GOOGLE_MAPS_API_KEY`, Places API (New), `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.  
Output: log of townships, places found, new inserts, and a report file `data/discovery-<Region>-<date>.json`.

### Geographic tick-list (run discovery by region)

Run once per region to cover Myanmar. Tick when done.

| # | Region | Command | Tick |
|---|--------|---------|------|
| 1 | Yangon | `--region="Yangon"` | ☐ |
| 2 | Mandalay | `--region="Mandalay"` | ☐ |
| 3 | Bago | `--region="Bago"` | ☐ |
| 4 | Naypyidaw | `--region="Naypyidaw"` | ☐ |
| 5 | Shan South | `--region="Shan South"` (Taunggyi, Kalaw, Heho, etc.) | ☐ |
| 6 | Ayeyarwady | `--region="Ayeyarwady"` (Pathein, Hinthada, etc.) | ☐ |
| 7 | Sagaing | `--region="Sagaing"` | ☐ |
| 8 | Magwe | `--region="Magwe"` | ☐ |
| 9 | Shan North | `--region="Shan North"` | ☐ |
| 10 | Shan East | `--region="Shan East"` | ☐ |
| 11 | Kayah State | `--region="Kayah State"` | ☐ |
| 12 | Kayin | `--region="Kayin"` | ☐ |
| 13 | Mon | `--region="Mon"` | ☐ |
| 14 | Rakhine | `--region="Rakhine"` | ☐ |
| 15 | Kachin | `--region="Kachin"` | ☐ |
| 16 | Chin | `--region="Chin"` | ☐ |
| 17 | Tanintharyi | `--region="Tanintharyi"` | ☐ |

New stations are inserted with `verification_source: 'distributor'`. Existing stations (matched by name + township + city) can have their coordinates updated if they differ.
