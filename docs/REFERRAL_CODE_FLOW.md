# Referral code flow

## When is the referral code created?

**The referral code is created on first use.** There is no separate “activation” step.

1. User signs in and opens **Earn** (`/earn`).
2. If they are **not** a station owner, the app calls the **get-referral-code** Edge Function with their session JWT.
3. The function validates the JWT, then:
   - Looks up `referral_codes` for that `user_id`.
   - If a row exists → returns that code.
   - If not → generates a new code (e.g. `FB-XXXXXXXX`), upserts into `referral_codes`, and returns it.

So the code is created the first time the function is successfully called for that user. Nothing else has to “happen” first.

**Share link:** The Earn page shows a link like `https://yoursite.com/station?ref=FB-XXXXXXXX`. When a station owner opens that link and registers their station, the `ref` query param pre-fills the referral code field on the **Station** page (`/station`), so the referrer gets credit when the station subscribes. (Legacy URLs `/operator` redirect to `/station`.)

## Why “Code unavailable” or 401?

If the Earn page shows “Code unavailable” and the console shows **401 (Unauthorized)** on `get-referral-code`, the request never gets a valid response. Common causes:

1. **Gateway JWT check** – The Edge Function is deployed with `verify_jwt: true` at the gateway. Supabase’s gateway can return 401 for some JWTs (e.g. after algorithm/key rotation). This project uses **verify_jwt: false** for `get-referral-code`; auth is done inside the function with `requireAuthedUser`.
2. **Wrong project** – `VITE_SUPABASE_URL` in `.env` must point to the same project the function is deployed to (e.g. `feenwusofmhnpuahekvu.supabase.co`).
3. **Session** – The app refreshes the session and sends `Authorization: Bearer <access_token>` explicitly. If the session is expired or missing, the user must sign in again.

## Testing the referral flow

1. **Get your referral code (as a driver/subscriber)**  
   Sign in with an account that is **not** a station owner. Open **Earn** (`/earn`). You should see a code like `FB-XXXXXXXX` and a share link. Copy the link (e.g. `https://yoursite.com/station?ref=FB-XXXXXXXX`).

2. **Open the share link as the station owner**  
   In another browser or incognito window (or a different device), open that link. You should land on the **Station** page (`/station`) with the referral code field **pre-filled** with the code from the URL.

3. **Register the station with the referral**  
   Complete station registration and payment flow. On success, the backend should associate the station with the referrer (e.g. `stations.referrer_user_id` and/or `referral_rewards` once the station subscribes).

4. **Verify referrer sees the reward (after subscription)**  
   Sign back in as the **referrer** (driver). Open **Earn** → “My referral rewards”. After the referred station is approved and subscribed, a reward row should appear (amount, status, date).

**Quick sanity checks:**  
- Signed-out user on `/earn` sees “Sign in to see and copy your referral code.”  
- Station owner on `/earn` sees the blue message that station owners do not receive referral rewards (no code).  
- Invalid or expired session shows “Your session expired. Please sign in again.” with a sign-in button.

## Deploying get-referral-code

- **Via Supabase MCP (Cursor):** Deploy with `verify_jwt: false` so the gateway does not reject the request; the function still enforces auth with `requireAuthedUser`.
- **Via CLI:** Use `--no-verify-jwt` so behaviour matches:
  ```bash
  supabase functions deploy get-referral-code --no-verify-jwt
  ```
