# Supabase on VPS (self-hosted)

FuelBot’s backend runs on a **self-hosted Supabase stack** on the VPS — not Supabase Cloud.

## Canonical URLs

| What | URL |
|------|-----|
| **API (Kong)** | `https://fuelbot.lucas-dev-server.tech` |
| **Studio** | `https://studio.fuelbot.lucas-dev-server.tech` |

Kong listens on port **8400** behind **Caddy** with valid TLS. The API is **publicly reachable** — no SSH tunnel required.

## App env vars

**Local dev** (`.env.local`):

```env
VITE_SUPABASE_URL=https://fuelbot.lucas-dev-server.tech
VITE_SUPABASE_ANON_KEY=<anon key from VPS / Studio>
```

**Vercel (production):** same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.  
`SUPABASE_SERVICE_ROLE_KEY` is **not** required for the frontend-only deploy.

**Scripts / imports** (local only, never in Vercel client bundle):

```env
SUPABASE_SERVICE_ROLE_KEY=<service role key — local scripts only>
```

Copy from [`.env.example`](../.env.example). Do **not** commit real keys.

## Applying schema changes (migrations)

1. Edit or add SQL under [`supabase/migrations/`](../supabase/migrations/).
2. Open **Studio → SQL editor**:  
   `https://studio.fuelbot.lucas-dev-server.tech/project/default/sql/new`
3. Paste the migration SQL and run it.

For the fleet efficiency feature, run once:

- [`supabase/migrations/RUN_IN_STUDIO_fleet_efficiency.sql`](../supabase/migrations/RUN_IN_STUDIO_fleet_efficiency.sql)

There is **no** `supabase db push` to Supabase Cloud and **no** tunnel service for day-to-day work.

## Verify after migration

```bash
curl -s "https://fuelbot.lucas-dev-server.tech/rest/v1/fleet_vehicles?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```

Expect `[]` (empty array), not `42P01 relation does not exist`.

## Edge Functions

Legacy Edge Functions live under [`supabase/functions/`](../supabase/functions/). Deploy and run them on the **VPS stack**, not Supabase Cloud. The React app on Vercel talks to Kong/PostgREST only unless you explicitly wire function URLs.

## Cursor / MCP

Do **not** use Supabase Cloud MCP (`mcp.supabase.com`). Use **Studio** for SQL and table browsing.

## Audit script

```bash
npm run audit:supabase
```

Checks that `.env` / `.env.local` point at `https://fuelbot.lucas-dev-server.tech` (not `*.supabase.co`).
