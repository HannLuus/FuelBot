# Auth confirmation emails (signup, password reset)

Signup and password-reset emails are **sent by Supabase Auth** on the server, not by the app or by Edge Functions. Resend is only used when Supabase is configured to use it as the SMTP provider.

## Password reset goes to the admin instead of the customer

The React app only calls `resetPasswordForEmail(customerEmail, …)`. **Supabase** chooses who receives the message. The app cannot address mail to your admin inbox.

What usually causes “admin got the customer’s reset email”:

1. **Send Email hook misconfigured** — If **Authentication → Hooks → Send Email** is enabled, Supabase **does not use SMTP** for auth mail. Your hook URL (Edge Function, Zapier, etc.) must send with **`to: user.email`** (the customer). If the integration sends to `ADMIN_NOTIFICATION_EMAIL`, `support@…`, or a fixed address, staff will get every reset link.  
   - **Fix A:** Turn **off** the Send Email hook. Then **Authentication → SMTP Settings** applies again, and Supabase/Resend delivers to the **account email** automatically.  
   - **Fix B:** Point the hook at the repo’s **`auth-send-email`** Edge Function (below), which always sends to `user.email`.

2. **Confusing “From” with “To”** — `FuelBot <admin@fuelbotmm.com>` is only the **sender** (Resend). Check the message headers: **To** should be the customer. Seeing the message in the **Resend dashboard** is normal for all outbound auth mail.

3. **Built-in mailer without custom SMTP** — On hosted projects, the default mailer may only target certain addresses. Configure **Custom SMTP** (below) so real customers receive mail.

### Optional: `auth-send-email` Edge Function (correct hook)

This repo includes `supabase/functions/auth-send-email`: it verifies the Supabase webhook signature and sends via Resend with **`to: [user.email]`** only (plus the second address for secure email-change flows).

1. Deploy: `supabase functions deploy auth-send-email --no-verify-jwt` (project already linked).
2. Set secrets: `RESEND_API_KEY` (if not already), and **`SEND_EMAIL_HOOK_SECRET`** — paste the secret from **Authentication → Hooks → Send Email → Generate secret** (format like `v1,whsec_…`).
3. In the dashboard, set the hook URL to  
   `https://<project-ref>.supabase.co/functions/v1/auth-send-email`  
   and save.

Until the hook is configured with a valid secret, the function will reject requests (signature verification).

## 500 on password reset (`/recover`) or “Error sending recovery email”

Supabase returns **500** when the auth server cannot hand off the message to your SMTP provider. In the **Auth logs** (Dashboard → **Logs** → **Auth**), the underlying cause is often explicit.

**Example (Resend):** `550 The fuelbotmm.com domain is not verified. Please, add and verify your domain on https://resend.com/domains`

**Fix:**

1. In **Resend** → **Domains**, add and **verify** the domain you use in the “From” address (DNS records as Resend instructs).
2. In **Supabase** → **Authentication** → **SMTP**, set **Sender email** to an address on that **verified** domain (e.g. `noreply@yourverifieddomain.com`).
3. Until the domain is verified, Resend will reject mail and Supabase will keep returning 500 for reset and signup emails.

The FuelBot app only calls `resetPasswordForEmail`; it cannot fix SMTP or Resend from the client.

### Verify a domain in Resend (step by step)

There is **no Resend MCP** in this Cursor setup, and Resend cannot verify a domain until **DNS** at your registrar matches what they show you. An AI in the IDE cannot click your DNS provider for you.

**Which domain?** The domain in your **Sender email** must be verified. This repo and past errors used **`fuelbotmm.com`**. If you switch to **`fuelbot.com`**, verify **`fuelbot.com`** in Resend and set every sender to an address on that domain (`noreply@fuelbot.com`, etc.). **`fuelbot.com` and `fuelbotmm.com` are different** — verify the one you actually send from.

1. Sign in at [resend.com](https://resend.com) → **Domains** → **Add domain**.
2. Enter the domain (e.g. `fuelbot.com` or `fuelbotmm.com`).
3. Resend shows **DNS records** (typically **DKIM** and sometimes **SPF** / **MX** depending on product and whether you receive mail on that domain). Copy each record exactly.
4. In your **DNS host** (Cloudflare, Namecheap, Route 53, etc.), create those records. Save and wait for propagation (often a few minutes; sometimes up to 48 hours).
5. Back in Resend, click **Verify**. Status should become **Verified**.
6. In **Supabase** → **Authentication** → **SMTP**, set **Sender email** to an address on that **same** verified domain (e.g. `support@fuelbot.com`). Save.
7. Trigger a **password reset** again. If it still fails, open Supabase **Logs** → **Auth** and read the latest error line (often another 550 with a clear reason).

**Edge Functions** (invoice, alerts, etc.) use Resend with `RESEND_FROM_EMAIL` or defaults like `admin@fuelbotmm.com` in code — after changing domain, set **`RESEND_FROM_EMAIL`** in Supabase **Edge Function secrets** to a `From` on your **verified** domain so those emails don’t fail too.

### Where do the Hostinger values come from? (Resend UI)

Resend **generates** the DKIM record; you do not invent the `p=MIGf…` string yourself.

1. Sign in at **[resend.com](https://resend.com)** (same account you use for the API key).
2. Open **Domains** in the sidebar (or go to **Emails** → **Domains**, depending on the current Resend layout).
3. **Click your domain** (e.g. `fuelbotmm.com`) — not just the list row checkbox; open the **domain detail** page. The URL often looks like `resend.com/domains/<id>`.
4. On that page, find the **DNS Records** (or **Records**) section — a table with columns like **Type**, **Name**, **Value**, **Status**.
5. Locate the **DKIM** line: **Type** = **TXT**, **Name** = something like **`resend._domainkey`** (Resend shows the exact hostname).
6. **Copy**:
   - **Name** → paste into Hostinger’s **Name / Host** field (often exactly `resend._domainkey`; if Hostinger appends your domain automatically, do **not** type `fuelbotmm.com` twice — follow Hostinger’s hint text).
   - **Value** → the full TXT body, starting with `p=MIGfMA0GCSqGSIb3...` (very long). Use Resend’s **copy** control if there is one so you do not truncate it.

If you only see a shortened value, click the row or an **expand** / **show full** control until you can copy the **entire** string. A partial value will never verify.

### Hostinger DNS + Resend (common case)

If **Resend** shows **DKIM** as *Pending* for a **`resend._domainkey`** TXT record while **SPF/MX** on the `send` subdomain are already *Verified*, your registrar (e.g. **Hostinger**) is often **missing that TXT record**.

1. In **Resend** → **Domains** → click the domain → **DNS Records** → **DKIM** **TXT** row → copy **Name** and **Value** as above.
2. In **Hostinger** → **DNS / Nameservers** → **Add record**:
   - **Type:** TXT  
   - **Name / Host:** use exactly what Resend shows (often `resend._domainkey` — Hostinger may want only the left part before your domain; if verification still fails, try the full name Resend documents).
   - **Value:** paste the entire TXT content from Resend.
3. Save, wait for propagation (minutes to a few hours), then click **Verify** again in Resend.

You can keep **Hostinger Mail** MX and SPF/DKIM for **mailbox** email at `@fuelbotmm.com`; **Resend** needs **its own** DKIM record for **sending** via their API/SMTP. If Resend asks you to **merge SPF** at the root `@` TXT, follow their wording (e.g. add their `include:` to a single SPF line — avoid more than one SPF TXT on the same name).

## Why no email arrived

- **Supabase Cloud (hosted):** Auth email is controlled by your **Supabase project** settings. The `supabase/config.toml` in this repo applies to **local** Supabase only (`supabase start`). For the hosted project, SMTP is configured in the **Dashboard**.
- **Default behaviour:** If Custom SMTP is not set, Supabase uses its built-in mailer, which **only sends to addresses that are in your project’s team**. Any other address (e.g. a new user’s email) will not receive a message, and nothing is sent via Resend.

So if you’re on the hosted project and haven’t configured Custom SMTP, confirmation emails never go to Resend and never reach normal signup addresses.

## Fix: Configure Custom SMTP in Supabase Dashboard

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** → your project.
2. Go to **Authentication** → **SMTP Settings** (or **Project Settings** → **Auth** → **SMTP**).
3. Enable **Custom SMTP** and set:

   | Field        | Value              |
   |-------------|---------------------|
   | Sender email | A verified sender in Resend (e.g. `noreply@yourdomain.com`) |
   | Sender name  | `FuelBot` (or your app name) |
   | Host         | `smtp.resend.com`   |
   | Port         | `465` (or `587`)     |
   | Username     | `resend`            |
   | Password     | Your **Resend API key** (from resend.com → API Keys) |

4. Save. After this, Supabase Auth will send signup and password-reset emails through Resend, and they will show in Resend’s dashboard.

**Resend:** The “Sender email” must use a **verified domain** in Resend. If you use e.g. `noreply@fuelbot.app`, add and verify that domain in Resend first.

## Local development

For local Supabase (`supabase start`), auth email is driven by `supabase/config.toml` under `[auth.email.smtp]`. Set `pass = "env(RESEND_API_KEY)"` and run with `RESEND_API_KEY` set. The sender there must also be a Resend-verified address.

## Custom confirmation email (welcome message)

The default “Confirm your signup” email is minimal. This repo includes a **warm, on-brand** confirmation template so new users get a welcome and a clear next step.

### Local development

The template is already wired in `supabase/config.toml`:

- **Subject:** “Welcome to FuelBot — confirm your email”
- **Body:** `supabase/templates/confirmation.html` (welcome copy + “Confirm your email” button using `{{ .ConfirmationURL }}`)

When you run `supabase start` with SMTP configured, signup confirmation emails use this template.

### Hosted project (Dashboard)

To use the same welcome email in your **hosted** Supabase project:

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** → your project → **Authentication** → **Email Templates** (or **Templates**).
2. Open the **“Confirm signup”** template.
3. Set **Subject** to: `Welcome to FuelBot — confirm your email`
4. Set **Body** to the contents of `supabase/templates/confirmation.html` in this repo.  
   Do **not** remove or change `{{ .ConfirmationURL }}` — that is the confirmation link.

After saving, new signups will receive the welcome email instead of the default.

## Reset password email (hosted) + landing on `/auth`

Password-reset links must end on a URL where the app can read `type=recovery` in the **hash** and show the **new password** form.

1. **Redirect allow list:** Supabase → **Authentication** → **URL Configuration** → add  
   `https://fuelbotmm.com/auth` and `http://localhost:5173/auth` (and any preview domain if needed).  
   The app calls `resetPasswordForEmail` with `redirectTo: <origin>/auth`.

2. **If the link opens the homepage while you’re already “signed in”** with no password step: Supabase may be redirecting to the **site root** with tokens in the hash. The FuelBot **`index.html`** now sends those visits to **`/auth`** before React loads so `AuthPage` can run the reset flow.

3. **Branded reset email:** Copy the HTML from **`supabase/templates/recovery.html`** into the dashboard:

   - **Authentication** → **Email Templates** → **Reset password**
   - Set **Subject** (e.g. `Reset your FuelBot password`)
   - Paste the file contents as **Body** — keep **`{{ .ConfirmationURL }}`** exactly (that is the reset link).

## References

- [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
