# Supabase setup for FuelBot

## Canonical project (do not change casually)

| Item | Value |
|------|--------|
| **Project ref** | `feenwusofmhnpuahekvu` |
| **API URL** | `https://feenwusofmhnpuahekvu.supabase.co` |
| **Dashboard** | [Project settings](https://supabase.com/dashboard/project/feenwusofmhnpuahekvu/settings/api) |

The Vite app reads **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** from `.env` (see `.env.example`). The anon key’s JWT payload must contain the same `ref` as in the URL, or the client throws on startup.

**Verify your machine:** from the repo root run `npm run audit:supabase`. It checks `.env` / `.env.local`, `.cursor/mcp.json`, and tracked files for this ref and blocks known typos (e.g. wrong subdomain strings).

**One local env file:** use **`.env`** only for local development (from `.env.example`). Do not maintain `.env.staging` or `.env.production` in the repo folder — they cause wrong-project confusion. Those filenames stay in `.gitignore` so they are never committed if someone creates them by mistake.

**Vercel:** set **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** on **Production** to this project. Remove or realign **Preview** / **Development** env vars that still point at an old staging Supabase project.

**GitHub:** remove unused repo or org **Secrets** that were only for staging, if any. No change needed if you are not using Actions with Supabase keys.

---

This project is wired to your Supabase project **feenwusofmhnpuahekvu**. Follow these steps so the app (and the AI) can use Supabase safely.

---

## 1. API keys – where to get them and where to put them

### Get the keys

1. Open your project in the dashboard:  
   **[Supabase → Project feenwusofmhnpuahekvu → Settings → API](https://supabase.com/dashboard/project/feenwusofmhnpuahekvu/settings/api)**

2. Copy:
   - **Project URL** → use for `SUPABASE_URL`
   - **anon public** key → use for `SUPABASE_ANON_KEY` (client-safe)
   - **service_role** key → use for `SUPABASE_SERVICE_ROLE_KEY` only if you need server-side admin access (never expose to the client)

### Put them in `.env` (never commit)

1. In the project root, copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in the values you copied. Example:
   ```env
   SUPABASE_PROJECT_REF=feenwusofmhnpuahekvu
   SUPABASE_URL=https://feenwusofmhnpuahekvu.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   # SUPABASE_SERVICE_ROLE_KEY=...   # only if needed
   ```

3. **Do not commit `.env`.** It’s already in `.gitignore`. Use `.env` only for local development and keep keys out of the repo.

Once `.env` exists with real values, any app code (and tooling that reads env) can use Supabase. The AI can rely on you having done this and can reference `SUPABASE_URL` and `SUPABASE_ANON_KEY` in code.

---

## 2. MCP (Cursor ↔ Supabase)

This repo is already configured to use the **hosted Supabase MCP** for your project.

- Config: `.cursor/mcp.json`
- Server: `https://mcp.supabase.com/mcp?project_ref=feenwusofmhnpuahekvu`
- So Cursor talks to **this project only** (feenwusofmhnpuahekvu), not your whole account.

### What you need to do

1. **Restart Cursor** (or reload the window) so it picks up `.cursor/mcp.json`.
2. **Sign in when prompted:** The first time you use a Supabase MCP tool, Cursor will open a browser so you can log in to Supabase and grant access. Use the account that owns the project.
3. **Check MCP:**  
   Cursor → **Settings → Cursor Settings → Tools & MCP**. You should see the `supabase` server. You can ask the AI to use MCP to list tables, run SQL, etc.

No API keys go into the MCP config; auth is via that one-time OAuth-style login.

### Optional: read-only or local

- **Read-only:** To restrict the MCP to read-only DB access, change the URL in `.cursor/mcp.json` to:
  ```json
  "url": "https://mcp.supabase.com/mcp?project_ref=feenwusofmhnpuahekvu&read_only=true"
  ```
- **Local Supabase:** If you run `supabase start`, a local MCP is available at `http://localhost:54321/mcp`. You can add that as another MCP server in `.cursor/mcp.json` if you want to use the local stack.

---

## 3. Supabase CLI

The project already has Supabase initialized (`supabase init`). To use the CLI against your **remote** project:

### Install CLI (if needed)

- **npm:** `npm install supabase --save-dev`
- **Homebrew:** `brew install supabase/tap/supabase`
- Or see: [Supabase CLI – Getting started](https://supabase.com/docs/guides/local-development/cli/getting-started)

### Login and link

1. Log in (opens browser):
   ```bash
   supabase login
   ```

2. Link this repo to project **feenwusofmhnpuahekvu**:
   ```bash
   supabase link --project-ref feenwusofmhnpuahekvu
   ```
   When prompted, enter the database password you set for the project (or get it from Dashboard → Project Settings → Database).

After this, commands like `supabase db pull`, `supabase db push`, and `supabase functions deploy` will target this project.

### Local Supabase (optional)

To run Supabase locally (Docker required):

```bash
supabase start
```

Local API URL: `http://localhost:54321`  
Local MCP: `http://localhost:54321/mcp`

---

## Quick reference

| What              | Where |
|-------------------|--------|
| Project dashboard | [Settings → General](https://supabase.com/dashboard/project/feenwusofmhnpuahekvu/settings/general) |
| API keys          | [Settings → API](https://supabase.com/dashboard/project/feenwusofmhnpuahekvu/settings/api) |
| Project ref       | `feenwusofmhnpuahekvu` |
| Env file          | `.env` (create from `.env.example`, do not commit) |
| MCP config        | `.cursor/mcp.json` |
