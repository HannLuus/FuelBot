# FuelBot — ATLAS development workflow

This is the project’s **operating checklist** for non-trivial changes (new features, schema changes, new Edge Functions, auth or payment touchpoints). It adapts the **ATLAS** steps from `docs/special/build_app.md` to this stack: **Vite + React + TypeScript**, **Supabase (Postgres/PostGIS, Auth, RLS, Edge Functions)**, **Vercel**.

**Principle:** keep **business rules and data correctness** in **migrations, RLS, and Edge Functions**; use the UI for presentation and calls. See also `.cursor/rules/supabase-vercel-connections.mdc` for which tool to use (MCP vs CLI vs app env).

---

## A — Architect (before code)

Answer briefly:

| Question | Your answer |
|----------|-------------|
| **Problem** | One sentence: what pain goes away? |
| **User** | Driver / station owner / admin / B2B — be specific |
| **Success** | Observable outcome (e.g. “X saves in DB and shows in UI”) |
| **Constraints** | i18n (en + my), RLS, API cost, mobile PWA, existing tables |

**Output:** paste this into the issue or PR description when useful:

```markdown
## App brief
- **Problem:**
- **User:**
- **Success:**
- **Constraints:**
```

---

## T — Trace (design)

1. **Data:** New/changed tables, columns, indexes, triggers, RPCs — list them. Prefer **versioned migrations** under `supabase/migrations/` (not ad-hoc DDL in production).
2. **Integrations:** Supabase client, Edge Function callers, Google/Gemini scripts, email — note auth (anon JWT, service role, admin checks).
3. **Edge cases:** rate limits (`submit-report`, external APIs), token expiry, offline PWA, empty lists, permission denied (RLS), duplicate submissions.

**References:** domain overview in [README.md](../README.md); auth/email [auth-email-setup.md](./auth-email-setup.md); referral JWT [REFERRAL_CODE_FLOW.md](./REFERRAL_CODE_FLOW.md).

---

## L — Link (validate connections first)

Do this **before** large UI or function work:

- [ ] **Local app:** `cp .env.example .env` if needed; `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set; `npm run dev` loads.
- [ ] **Scripts / imports:** `SUPABASE_SERVICE_ROLE_KEY` in `.env` where required (never in client code).
- [ ] **Edge Functions:** new or changed functions have secrets documented (see README); `verify_jwt` matches `supabase/config.toml` patterns for admin/callable functions.
- [ ] **RLS:** policy changes tested as **real roles** (anon, authenticated, admin path), not only as service role.
- [ ] **Third-party APIs:** key present, quota understood (Google Geocoding/Places, Gemini, etc.).

From Cursor, prefer **Supabase MCP** for remote inspection and deploys when available; use **CLI** for reproducible `db push` / local stack — see `supabase-vercel-connections` rule.

---

## A — Assemble (build order)

Recommended order to avoid rework:

1. **Database** — migration(s), seeds if needed, RLS policies.
2. **Backend** — Edge Functions under `supabase/functions/`, shared helpers in `_shared/`.
3. **Frontend** — types, `src/lib/supabase` usage, pages/components, **i18n** keys in `src/i18n/locales/`.
4. **Config** — `supabase/config.toml` function entries; `.env.example` if new env vars; README if operators must set secrets.

Reuse existing patterns: route guards, role checks, Tailwind v4, MapLibre usage.

---

## S — Stress-test (before merge)

Minimum bar:

- [ ] **Happy path** — primary user flow works end-to-end.
- [ ] **Errors** — network failure, 401/403, validation errors show sensible UI (and no silent failures).
- [ ] **Empty / edge** — no data, long text, stale report TTL if relevant.
- [ ] **Build** — `npm run lint` and `npm run build` pass.

Add automated tests when the feature is critical or regression-prone; this repo does not require a test suite for every change, but **payment, auth, and report submission** deserve extra manual checks.

---

## V + M — Validate & monitor (production-minded)

Use when shipping something user-facing or security-sensitive:

**V — Validate**

- Server-side validation in Edge Functions (don’t trust the client).
- RLS prevents cross-tenant or cross-user reads/writes.
- No secrets in client bundles; service role only server-side/scripts.

**M — Monitor**

- Supabase **Edge Function logs** and **Database** logs for new errors after deploy.
- `ADMIN_NOTIFICATION_EMAIL` and related flows if you changed admin notifications.

---

## Related docs

| Doc | Use for |
|-----|---------|
| [docs/special/build_app.md](./special/build_app.md) | Generic ATLAS reference |
| [docs/SUPABASE_SETUP.md](./SUPABASE_SETUP.md) | Supabase project setup |
| [README.md](../README.md) | Stack, env, deploy commands, domain tables |

---

## What we are *not* standardizing

- **Local SQLite “memory” stacks** from `docs/special/CLAUDE.md` — not part of FuelBot; app state lives in **Supabase**.
- **Claude-only VS Code setup** from `docs/special/SETUP_GUIDE.md` — optional for individuals; use any editor/AI with this workflow.
