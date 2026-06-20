# FuelBot — agent context (read first)

**FuelBot does not use Supabase Cloud.** The backend is **self-hosted Supabase on a VPS**.

Do not assume `*.supabase.co`, project ref `feenwusofmhnpuahekvu`, Supabase Cloud Dashboard, Cloud MCP, or `supabase db push` to cloud.

## Canonical backend

| What | URL |
|------|-----|
| **API (Kong / PostgREST / Auth)** | `https://fuelbot.lucas-dev-server.tech` |
| **Studio (SQL, tables, auth users)** | `https://studio.fuelbot.lucas-dev-server.tech` |

Public HTTPS — **no SSH tunnel** required for normal dev.

## App connection (React + scripts)

From `.env.local` / Vercel:

```env
VITE_SUPABASE_URL=https://fuelbot.lucas-dev-server.tech
VITE_SUPABASE_ANON_KEY=<anon key>
```

Local scripts only (never in Vercel client bundle):

```env
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Use `@supabase/supabase-js` with these values. Run `npm run audit:supabase` to verify env files point at the VPS URL.

## Schema / migrations

1. Add versioned SQL under `supabase/migrations/`.
2. Apply on the **VPS database** — either:
   - **Studio SQL editor:** `https://studio.fuelbot.lucas-dev-server.tech/project/default/sql/new` (paste and run), or
   - **Programmatic (Cursor/scripts):** `POST https://fuelbot.lucas-dev-server.tech/pg/query` with `{ "query": "<sql>" }` and `Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY` (local only).

Do **not** tell the user to use Supabase Cloud MCP, Cloud Dashboard, or cloud `supabase link` / `db push`.

## Frontend hosting

**Vercel** hosts the React app. It talks to the VPS API via `VITE_SUPABASE_*` only.

## Edge Functions

Functions under `supabase/functions/` run on the **VPS stack**, not Supabase Cloud.

## Full reference

See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
