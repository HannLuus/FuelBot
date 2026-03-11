# Auth confirmation emails (signup, password reset)

Signup and password-reset emails are **sent by Supabase Auth** on the server, not by the app or by Edge Functions. Resend is only used when Supabase is configured to use it as the SMTP provider.

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

## References

- [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
