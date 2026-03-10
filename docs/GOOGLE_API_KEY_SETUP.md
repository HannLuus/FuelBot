# How to get a Google Geocoding API key

The geocode script needs a Google API key to look up fuel station addresses on Google Maps. One key is enough; you can use either **Geocoding API** or **Maps** (which includes Geocoding).

---

## 1. Open Google Cloud Console

Go to: **https://console.cloud.google.com/**

Sign in with your Google account.

---

## 2. Create or select a project

- At the top of the page, click the **project dropdown** (it may say "Select a project" or show a project name).
- Click **"New Project"**.
- Enter a name (e.g. `FuelBot` or `Myanmar Fuel Stations`).
- Click **"Create"**.
- Wait for the project to be created, then make sure this project is selected in the top bar.

---

## 3. Enable the Geocoding API

- In the left menu, go to **"APIs & Services"** → **"Library"**  
  Or open: **https://console.cloud.google.com/apis/library**
- In the search box, type **"Geocoding API"**.
- Click **"Geocoding API"** in the results.
- Click **"Enable"**.

---

## 4. Create an API key

- In the left menu, go to **"APIs & Services"** → **"Credentials"**  
  Or open: **https://console.cloud.google.com/apis/credentials**
- Click **"+ Create Credentials"** at the top.
- Choose **"API key"**.
- Your new API key will be shown. **Copy it** and keep it somewhere safe.
- (Optional but recommended) Click **"Restrict key"** to limit usage:
  - Under **"API restrictions"**, choose **"Restrict key"**.
  - Select only **"Geocoding API"**.
  - Save.

---

## 5. Add the key to your project

In your FuelBot project root, edit (or create) the **`.env`** file and add one of these lines:

```bash
GOOGLE_GEOCODING_API_KEY=your_api_key_here
```

or:

```bash
GOOGLE_MAPS_API_KEY=your_api_key_here
```

Replace `your_api_key_here` with the key you copied. The script accepts either variable name.

**Important:** Do not commit `.env` to git (it should already be in `.gitignore`).

---

## 6. Billing (required for Geocoding)

Google Cloud requires a billing account to use the Geocoding API, but they give **$200 free credit per month** and Geocoding has a **free tier**:

- **$5 free credit per month** for Geocoding (about 40,000 requests).
- Beyond that, pricing is per request; for a few hundred stations you typically stay within free tier.

To enable billing:

- Go to **"Billing"** in the left menu: https://console.cloud.google.com/billing
- Link a billing account (or create one and add a payment method).
- Your project will use this billing account; you can set budget alerts in Billing → Budgets & alerts.

---

## Summary checklist

1. [ ] Go to https://console.cloud.google.com/
2. [ ] Create or select a project
3. [ ] Enable **Geocoding API** (APIs & Services → Library → search "Geocoding API" → Enable)
4. [ ] Create an **API key** (APIs & Services → Credentials → Create credentials → API key)
5. [ ] Copy the key and add `GOOGLE_GEOCODING_API_KEY=your_key` to `.env`
6. [ ] Ensure billing is set up (free tier is usually enough)

Then run:

```bash
npm run geocode-verified-stations
```
