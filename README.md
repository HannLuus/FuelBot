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

- `VITE_PAYMENT_INSTRUCTIONS`
- `VITE_PAYMENT_QR_URL`
- `ADMIN_NOTIFICATION_EMAIL` (for admin action emails; test: `best.iptvmm@gmail.com`)
- Tier pricing:
  - `VITE_TIER_PRICE_SMALL_MMK`
  - `VITE_TIER_PRICE_MEDIUM_MMK`
  - `VITE_TIER_PRICE_LARGE_MMK`

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
```

Set `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function secrets via the Supabase dashboard.

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
| `station_claims` | Operator claim requests (admin approval) |
| `station_followers` | Users following a station for alerts |
| `subscriptions` | Operator subscription tiers |
| `alerts_log` | Dispatched alert records |
| `b2b_subscriptions` | Paid B2B entitlements (national view, route view) |
| `routes` | Predefined routes for transport companies (corridor view) |

**B2B (national / route view):** Nationwide and route-scoped station data are gated. Only users with an active row in `b2b_subscriptions` (and `valid_until > now()`) see "All Myanmar" or the route selector. Migrations are applied to the remote project. Demo data is in place: log in as **hann.mandalay@gmail.com** to see the "All Myanmar" pill and the **Yangon–Mandalay** route in the filter bar. To add more demo users or routes, see `supabase/seeds/seed-b2b-demo.sql` and insert into `b2b_subscriptions` (and `routes`) with the user's `auth.users.id`.

### Confidence model

Reports are weighted by role (VERIFIED_STATION → TRUSTED → CROWD → ANON) and decay by freshness. Votes add a bonus. The trigger `on_report_insert` recomputes `station_current_status` automatically on every new report or vote.

### Freshness / decay windows

| Role | Window |
|---|---|
| VERIFIED_STATION | 4 hours |
| TRUSTED | 2 hours |
| CROWD | 1 hour |
| ANON | 30 minutes |

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
- Mark payment received (KBZ Pay, WavePay, bank transfer + reference)
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
