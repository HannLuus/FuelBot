# FuelBot

Real-time fuel availability and queue times at nearby stations. Built for Myanmar (first market), designed to expand globally.

**Supabase project:** `feenwusofmhnpuahekvu`

---

## Tech stack

- **Frontend:** Vite + React + TypeScript + TailwindCSS v4
- **PWA:** vite-plugin-pwa (installable, offline shell, push-ready)
- **Map:** MapLibre GL + OpenStreetMap (lazy-loaded)
- **Backend:** Supabase (Postgres + PostGIS, Auth, Realtime, Edge Functions)
- **Hosting:** Vercel (recommended)
- **i18n:** English + Burmese (Myanmar)

---

## Setup

### 1. Environment

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase dashboard.

Also configure:

- Payment copy, KPay QR URL, and optional KPay phone: **Admin → Payment settings** (`payment_config` in Supabase), not `VITE_*` vars
- `ADMIN_NOTIFICATION_EMAIL` (for admin action emails; e.g. `support@fuelbotmm.com`)
- **Invoices:** On station approval and B2B payment confirmation, customers receive a tax invoice email (Commercial Tax % configurable; default 5%). Optional Edge secrets: `INVOICE_COMMERCIAL_TAX_PERCENT`, `INVOICE_SUPPORT_EMAIL`, `INVOICE_COMPANY_NAME`. Rows are stored in table `invoices` with sequential `FB-YYYY-######` numbers via `allocate_invoice_number()`.
- Station subscription (flat 10,000 MMK/month = 120,000 MMK/year):
  - `VITE_STATION_SUBSCRIPTION_ANNUAL_MMK=120000`
  - `STATION_SUBSCRIPTION_ANNUAL_MMK=120000` (Edge Functions)

### 2. Install dependencies

```bash
npm install
```

### 3. Start dev server

```bash
npm run dev
```

### 4. Deploy Edge Functions (Supabase CLI)

```bash
supabase functions deploy submit-report
supabase functions deploy send-fuel-alerts
supabase functions deploy operator-report-payment
supabase functions deploy contact-us
supabase functions deploy get-referral-code --no-verify-jwt   # auth done in function; see docs/REFERRAL_CODE_FLOW.md
# Admin panel invokeables: disable gateway JWT so preflight/post hit the function; each uses requireAdminUser()
supabase functions deploy admin-approve-registration --no-verify-jwt
supabase functions deploy admin-reject-registration --no-verify-jwt
supabase functions deploy admin-create-station-from-suggestion --no-verify-jwt
supabase functions deploy admin-confirm-b2b --no-verify-jwt
supabase functions deploy admin-mark-payment --no-verify-jwt
supabase functions deploy admin-mark-referral-collected --no-verify-jwt
supabase functions deploy admin-mark-referral-paid --no-verify-jwt
supabase functions deploy snapshot-station-statuses
```

Schedule `snapshot-station-statuses` to run **hourly** (e.g. Supabase Dashboard → Database → Cron, or an external cron hitting the function URL) so that uptime metrics can be computed after ~1 month of data.

Set `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function secrets via the Supabase dashboard.

---

## Verified station data (distributor-led)

Government figures put Myanmar at **~2,600–2,700** registered filling stations. To avoid junk/AI-hallucinated pins, we source **verified** stations from official distributor lists first. See **[docs/VERIFIED_STATIONS_SOURCING.md](docs/VERIFIED_STATIONS_SOURCING.md)** for the top 10 distributors and plan.

- **All distributors (Max Energy, Shwe Taung Tan, SPC, Htoo, PTT):** One CSV and one import:
  ```bash
  npm run build-verified-stations    # name, address, township, city (no coordinates)
  npm run geocode-verified-stations  # look up each address on Google Maps; fill lat/lng only when we get a result (requires GOOGLE_GEOCODING_API_KEY in .env)
  npm run import-verified-stations   # imports into Supabase (bypasses RLS)
  ```
- See [docs/VERIFIED_STATIONS_SOURCING.md](docs/VERIFIED_STATIONS_SOURCING.md). Coordinates come only from geocoding the address (e.g. Google Geocoding API), not from invented or spread positions.

### Discovery (add stations from Places API)

To discover and add fuel stations by region (Denko, BOC, PT Power, Max Energy, Asia Energy) using Google Places API:

1. In `.env` set `GOOGLE_GEOCODING_API_KEY` or `GOOGLE_MAPS_API_KEY`, and ensure Places API (New) is enabled in Google Cloud. Keep `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. From the project root run:
   ```bash
   npm run discover -- --region="Shan South"
   ```
   Or with a district: `npm run discover -- --region="Ayeyarwady"`  
   Dry-run (no DB writes): `npm run discover -- --region="Shan South" --dry-run`
3. See [docs/MYANMAR_STATION_LOCATIONS.md](docs/MYANMAR_STATION_LOCATIONS.md) for the full region tick-list and options.

---

## Database

All migrations are applied to the remote Supabase project. Key tables:

| Table | Purpose |
|---|---|
| `fuel_types` | Seeded fuel type codes (RON92, RON95, DIESEL, PREMIUM_DIESEL) |
| `stations` | Fuel stations with PostGIS coordinates |
| `station_status_reports` | Crowd + verified fuel status reports |
| `status_votes` | Confirm / Disagree votes per report |
| `station_current_status` | Computed best status per station (auto-updated by trigger) |
| `station_status_snapshots` | Hourly snapshots for uptime calculation (filled by cron) |
| `station_claims` | Operator claim requests (admin approval) |
| `station_followers` | Users following a station for alerts |
| `subscriptions` | Operator subscription tiers |
| `alerts_log` | Dispatched alert records |
| `b2b_subscriptions` | Paid B2B entitlements (national view, route view) |
| `routes` | Predefined routes for transport companies (corridor view) |

**B2B (national / route view):** Nationwide and route-scoped station data are gated. Only users with an active row in `b2b_subscriptions` (and `valid_until > now()`) see "All Myanmar" or the route selector. Migrations are applied to the remote project. Demo data is in place: log in as **hann.mandalay@gmail.com** to see the "All Myanmar" pill and the **Yangon–Mandalay** route in the filter bar. To add more demo users or routes, see `supabase/seeds/seed-b2b-demo.sql` and insert into `b2b_subscriptions` (and `routes`) with the user's `auth.users.id`.

### Confidence model

Reports are weighted by role (VERIFIED_STATION → TRUSTED → CROWD → ANON) and decay by freshness. Votes add a bonus. The trigger `on_report_insert` recomputes `station_current_status` automatically on every new report or vote.

### Freshness / display TTL

All roles use a **single 48-hour** window: each report’s `expires_at` is `reported_at + 48h`, and `compute_station_status` uses the same horizon for staleness and confidence decay (`role_decay_seconds`). After 48 hours with no valid report, aggregated status clears to empty / stale. Adjust in `role_decay_seconds` and `submit-report` (`STATUS_DISPLAY_TTL_SECONDS`) together.

### Uptime: how it’s calculated and sabotage resistance

**What feeds uptime**  
The “current” status shown to drivers is a **single blended value** per station: it combines **station owner (verified) reports** and **crowd reports**, with **role weighting** (verified > trusted > crowd > anon) and **time decay**. So owner updates count more and stay longer; crowd and anon reports have less weight and expire sooner.

**What we snapshot**  
Every hour we snapshot that **computed** status into `station_status_snapshots`: fuel state and the **source role** that drove it (e.g. `VERIFIED_STATION`, `CROWD`, `ANON`).

**How uptime is computed**  
- Uptime = “% of snapshot hours in the last 30 days when the station had fuel (at least one type available)”.  
- So it **is** a combination of owner and crowd: each hour we record whatever the blended status was at that time.

**Sabotage resistance**  
- **Reporting limits:** Each device can send at most **3 reports per station per hour** (rate limit in `submit-report`). So one person cannot flood “out of fuel” in a short burst.  
- **Proximity:** Non-verified reports are only accepted if the reporter is within 1 km of the station.  
- **Role weighting:** Verified and trusted reports outweigh crowd/anon in the blended status, so a single anon/crowd “OUT” does not override a recent owner “AVAILABLE”.  
- **Uptime metric:** We only count an hour as **“no fuel”** (reducing uptime) when the snapshot’s **source** is `VERIFIED_STATION` or `TRUSTED`. If the status was “out” but the source was `CROWD` or `ANON`, that hour is **not** counted against uptime (we treat it as uncertain). So repeated “out” reports from one or a few crowd/anon users cannot drag down a station’s uptime.

### Sourcing station data (Myanmar cities)

To generate a CSV of fuel stations across multiple cities using the Gemini API:

1. Add your Gemini API key to `.env`: `GEMINI_API_KEY=your_key` (get one at [Google AI Studio](https://aistudio.google.com/app/apikey)).
2. Run: `npm run source-stations`
3. Output is written to `data/stations-myanmar.csv` (Yangon, Mandalay, Naypyidaw, Mawlamyine, Bago, Taunggyi). Columns: name, brand, lat, lng, address_text, township, city, country_code.

To import the CSV into your Supabase `stations` table (requires `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`):

```bash
npm run import-stations
```

**Highway routes:** To add stations along major highways (e.g. Yangon–Mandalay), add a "highway" pass in `scripts/source-stations-gemini.mjs`: for each route, prompt Gemini with e.g. "List all fuel stations along the [Route Name] highway between [City A] and [City B], Myanmar, with name, brand, approximate lat/lng, nearest town/township" and merge those rows into the CSV before import. You can also add more cities to the `CITIES` array in the same script.

- **More cities:** Add more city + township arrays (e.g. Naypyidaw, Mawlamyine, Taunggyi, Bago, Pathein) and run the same township-by-township + supplement flow. Add each city’s townships and a target count, then extend the script to loop over them and append to the same CSV (or separate CSVs per region).
- **Highway routes:** Add a “highway” pass: for each major route (e.g. Yangon–Mandalay, Yangon–Naypyidaw, Yangon–Mawlamyine), prompt Gemini with: “List all fuel stations along the [Route Name] highway between [City A] and [City B], Myanmar, with name, brand, approximate lat/lng, nearest town/township.” Merge those rows into your CSV and re-run import. Highway stations are especially useful for long-distance drivers.

You can run the script in stages (e.g. one region per run) and concatenate or re-import CSVs so coverage grows without re-fetching existing cities.

---

## Features

### Public (drivers)
- Nearby station list, sorted by distance, with per-fuel traffic lights (green/yellow/red/grey)
- Filter by fuel type and status
- Station detail with queue estimate and confidence score
- 3-step report flow (fuel status per type → queue bucket → optional note)
- Confirm / Disagree voting on existing reports
- Open in Maps deep link (Google / Apple Maps)
- Follow a station for fuel-back alerts
- Full Burmese + English UI

### Operator
- Owner-first station registration and verification workflow
- Tier selection (small / medium / large) with annual MMK pricing
- Payment instructions + QR visibility
- Referral code support (15% reward to the person who gets the deal)
- Post verified updates (after admin approval)
- Recognition photo upload/confirm flow for landing hero

### Admin
- Review flagged reports
- Review pending station registrations with station/location photos
- Mark payment received (KBZ Pay / KPay + reference)
- Tier verification policy: reject under-declared tier, accept over-declared tier
- Approve / reject station claims
- Device suspension

---

## Fuel types (Myanmar)

| Code | English | Burmese |
|---|---|---|
| RON92 | 92 | ၉၂ |
| RON95 | 95 | ၉၅ |
| DIESEL | Diesel | ဒီဇယ် |
| PREMIUM_DIESEL | Premium Diesel | ပရီမီယံဒီဇယ် |

---

## Adding a new country

1. Seed new fuel type rows in `fuel_types` with the country's codes and display names
2. Add stations with `country_code` set to the new country
3. Add translations to `src/i18n/locales/`
4. No code changes required for core functionality

---

## Deployment (Vercel)

```bash
npm run build
# Push dist/ or connect repo to Vercel
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel environment variables.
