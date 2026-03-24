# FuelBot implementation checklist

**Use this file to track progress.** Tick each item by changing `- [ ]` to `- [x]`. Do not leave anything behind.

Recommended order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.

---

## 1. Database and backend

- [x] Migration: Add to `stations`: `subscription_tier_requested` (text/enum: small, medium, large)
- [x] Migration: Add to `stations`: `payment_received_at` (timestamptz)
- [x] Migration: Add to `stations`: `payment_method` (text)
- [x] Migration: Add to `stations`: `payment_reference` (text)
- [x] Migration: Add to `stations`: `payment_confirmed_by` (uuid, admin user id)
- [x] Migration: Add to `stations`: `referrer_user_id` (uuid, nullable)
- [x] Migration: Add to `stations`: `station_photo_urls` (text[] or JSONB) for tier verification
- [x] Migration: Add to `stations`: `location_photo_url` (text, optional)
- [x] Migration: Create `referral_codes` table (user_id, code unique, created_at) or implement derived codes
- [x] Migration: Optional — `referral_rewards` table (referrer_user_id, station_id, amount_mmk, status, paid_at, payment_reference)
- [x] Migration: Optional — for hero: `referral_paid_at` on stations if using Option B minimal state
- [x] Migration: Optional — profiles or columns for recognition (display_name, photo_url, show_on_recognition; recognition_photo_url, confirmed)
- [x] RLS or Edge Functions: Admin can update stations (payment fields, is_verified); owner can update only tier + referral code + photos for own station
- [x] Edge Function: `admin-mark-payment` (station_id, payment_method, payment_reference); verify caller is admin
- [x] Edge Function: `admin-approve-registration` (station_id); verify caller is admin; require payment_received_at before setting is_verified = true
- [x] Edge Function: `admin-reject-registration` (station_id); clear verified_owner_id and optionally tier/payment/photo fields
- [x] Edge Function or webhook: Send admin email (Resend) on new pending registration (station created with verified_owner_id)
- [x] Edge Function or webhook: Send admin email (Resend) on new pending claim (station_claims insert, status PENDING)
- [x] Admins table or custom claim: Identify admin users; add test admin (support@fuelbotmm.com)
- [x] Server-side: Best-match referral resolution (exact → normalized → fuzzy); validate when owner saves tier (exists, not own code); set referrer_user_id only after validation

---

## 2. Types and config

- [x] Types: Add `SubscriptionTierRequested = 'small' | 'medium' | 'large'`
- [x] Types: Extend `Station` with optional subscription_tier_requested, payment_received_at, payment_method, payment_reference, payment_confirmed_by, referrer_user_id, station_photo_urls, location_photo_url
- [x] Types: Add referral code and referral reward types if using dedicated tables
- [x] Create `src/lib/subscriptionTiers.ts` (or equivalent): tier definitions and MMK prices (Small, Medium, Large)
- [x] Config: Tier prices from env (TIER_PRICE_SMALL_MMK, TIER_PRICE_MEDIUM_MMK, TIER_PRICE_LARGE_MMK) or constants
- [x] .env.example: Document VITE_PAYMENT_INSTRUCTIONS, VITE_PAYMENT_QR_URL, ADMIN_NOTIFICATION_EMAIL, tier price env vars
- [x] README: Document payment and admin notification env vars

---

## 3. Operator page

- [x] Operator: Fetch `station_current_status` for myStation when myStation is set
- [x] Operator: Show "Current status (what drivers see)" block — per-fuel status, queue, last updated time
- [x] Operator: Pre-fill "Post Fuel Update" form from station_current_status (AVAILABLE/LIMITED/OUT or SKIP)
- [x] Operator: Section title/copy "My fuel status" / "Update fuel availability" and hint text
- [x] Operator: "Complete verification" card for unverified — tier selector (Small/Medium/Large) with name, description, price MMK/year
- [x] Operator: Persist subscription_tier_requested when owner selects tier (owner can change until payment confirmed)
- [x] Operator: Require upload of station photos (one or more) — Supabase Storage; store station_photo_urls
- [x] Operator: Require upload of location photo — Supabase Storage; store location_photo_url
- [x] Operator: Referral code optional field in Complete verification; validate (server-side) and store referrer_user_id
- [x] Operator: Payment instructions text from env (VITE_PAYMENT_INSTRUCTIONS)
- [x] Operator: QR image(s) from env (VITE_PAYMENT_QR_URL or per-method); fallback "Contact us for payment details"
- [x] Operator: "I have paid" button (optional) and "We'll verify and activate soon" message
- [x] Operator: "Verified — your subscription is active" for verified stations; hide Complete verification when verified
- [x] Operator i18n (en + my): currentStatus, updateFuelStatusDescription, completeVerification, selectTier, small/medium/large, pricePerYearMMK, paymentInstructions, payVia, iHavePaid, weWillVerifySoon, referral code strings

---

## 4. Admin page

- [x] Admin: New tab or list "Pending registrations" — stations where verified_owner_id not null and is_verified = false
- [x] Admin: For each pending registration show: name, township, city, tier, expected amount (MMK/year), created, owner id, station_photo_urls, location_photo_url
- [x] Admin: Display station and location photos so admin can verify actual size
- [x] Admin: Tier verification — reject if under-declared (photos show station clearly larger than declared tier)
- [x] Admin: Tier verification — accept if over-declared (boasting; we get more revenue)
- [x] Admin: "Mark payment received" — KBZ Pay (KPay) only, reference (optional)
- [x] Admin: On Mark payment: update station payment_received_at, payment_method, payment_reference, payment_confirmed_by
- [x] Admin: "Approve" button — set is_verified = true; optional create subscriptions row (tier, 1 year)
- [x] Admin: "Reject" button — clear verified_owner_id and optionally tier/payment/photo fields; optional reject reason (e.g. "Tier under-declared")
- [x] Admin: Station claims — approving a claim only assigns verified_owner_id; owner must complete tier/photos/payment; admin approves via Pending registrations
- [x] Admin: Badge counts for pending registrations + pending claims on Admin entry (nav or header)
- [x] Admin: Only isAdmin users see Admin tab and can perform actions

---

## 5. Referral program

- [x] Referral codes: Generate and store unique code per signed-in user (table or derived)
- [x] Referral: In-app "Share your code — earn 15% when a station subscribes" and display/copy code
- [x] Referral: Shareable link (e.g. /operator?ref=CODE)
- [x] Referral: Entry point "Earn with FuelBot" / "Refer a station" (profile or dedicated page)
- [x] On station approval: Compute 15% of tier price; create referral_rewards record (or minimal state)
- [x] On station approval: Notify referrer (in-app and/or email) with amount and (Option B) station name/address to collect
- [x] On station approval (Option B): Notify station owner to pay referrer when they visit
- [x] Referral i18n (en + my): referral code label, placeholder, invalid/own-code errors, success, "Collect your X MMK at [station]", "Pay X MMK to referrer when they visit"

---

## 6. Transparency

- [x] Station cards: Show "Verified — claimed by station owner" (or equivalent) for verified stations
- [x] Station detail: Show "Verified — claimed by station owner" for verified stations
- [x] Station detail: When referrer exists and rewarded, show "Referred; referrer rewarded"
- [x] Station detail/cards: When referrer exists but not yet paid, show "Referred; reward pending"
- [x] Transparency i18n for all new strings (en + my)

---

## 7. Admin notifications

- [x] Set ADMIN_NOTIFICATION_EMAIL in env (production: support@fuelbotmm.com)
- [x] Trigger: Email on new pending registration (e.g. Database Webhook on stations insert where verified_owner_id not null)
- [x] Trigger: Email on new pending claim (e.g. Database Webhook on station_claims insert where status PENDING)
- [x] Admin panel: Summary line or badge "N pending registrations, M pending claims" visible when opening Admin

---

## 8. Landing page

- [x] Route: Landing at `/` for first-time visitors or `/landing`; CTA "Open FuelBot" / "Enter app" to main app
- [x] Routing: `/` and `/landing` show landing; app routes (/home, /station/*, /operator, /map) show app; logged-in at `/` optionally redirect to /home
- [x] Section "What we want to achieve": Real-time fuel, trust/quality, help everyone, transparent/fair, Myanmar first; short copy
- [x] Section "What you can earn": 15% referral, who gets the deal gets the reward, no cap; optional CTA to get referral code
- [x] Section "What it costs for fuel stations": Small/Medium/Large tiers with MMK/year; payment via KBZ Pay (KPay)
- [x] Landing i18n: all landing.* keys in en and my
- [x] Language switcher on landing (if not global)
- [x] Footer: optional contact

---

## 9. Hero / recognition (after landing and core flows)

- [x] Data model: One recognition photo per approved station; store recognition_photo_url and "confirmed" flag; allow submit or edit after approval
- [x] Prefer: Referrer + owner in same photo; fallback: manager only, or owner only, or referrer only; can submit or edit later
- [x] Rule: Photo only shown on hero when finally confirmed (after station approved and photo confirmed)
- [x] Supabase Storage: Bucket for recognition photos; upload after station is approved; allow replace/edit
- [x] Flow: After admin approves station, owner (and optionally referrer) can upload recognition photo; "Confirm and show" marks as confirmed for hero
- [x] Hero section: Fetch approved stations with confirmed recognition photo; display "People bringing stations on board" / "Stations helping the people"
- [x] Hero: Display photo, station name, caption; i18n for section titles (en + my)
- [x] Hero on landing page or dedicated page; visible, not buried

---

## 10. Error handling and polish

- [x] Operator: On tier/photo/referral save failure, show clear error and allow retry
- [x] Admin: On mark payment or approve/reject failure, show clear error and allow retry
- [x] Referral: On invalid code, show clear message (invalid or own code)

---

## 11. Optional / later

- [x] Reject reason: Optional field when admin rejects (e.g. "Tier under-declared; please register with correct tier"); show to owner
- [x] Notify owner on reject (email or in-app)
- [ ] Subscription renewal/expiry after one year (out of scope for MVP; document as future work)
- [ ] Browser push or in-app toast for admin when new registration/claim (Realtime); for MVP, email + badge is enough

---

**End of checklist.** Tick items as you complete them so nothing is left behind.
