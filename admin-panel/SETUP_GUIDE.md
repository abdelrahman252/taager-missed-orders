# Taager Bot License System Setup Guide

## What Changed

- `src/main/main.js` now talks to Supabase through Taager RPC functions instead of direct table access.
- `admin-panel/SUPABASE_SETUP.sql` locks down direct public table access with RLS and exposes only the required Taager license functions.
- `admin-panel/server.js` runs the local owner/admin tool and keeps the Supabase service-role key out of browser-to-Supabase requests.
- `admin-panel/index.html` is served by that local admin server.
- Taager remains SA-only for order flow. The app stores `taagerCountry: "sa"` for compatibility with Taager-style shared logic.

Autoconfirm is not part of Taager. That stays Taager-only.

## Step 1 - Create Supabase Project

1. Go to https://supabase.com and sign in.
2. Create a new project.
3. Save the database password somewhere safe.
4. Wait for the project to finish provisioning.

## Step 2 - Install the Database Schema

1. Open the Supabase SQL Editor.
2. Open `admin-panel/SUPABASE_SETUP.sql`.
3. Copy all of the SQL into Supabase.
4. Run it once.

The SQL creates the license tables, enables RLS, removes old broad policies, and installs the `taager_*` RPC functions used by the app.

For every installation using Saudi iPick marketing, run
`migrations/20261004_saudiipick_marketing_usage.sql` in the **Taager Orders**
Supabase SQL Editor after the base schema and before shipping the new desktop app. This creates the native
assignment table and the device-checked RPC. The admin panel's Marketing Usage
page then counts Saudi iPick assignments and edits per-account TikTok/Snapchat
limits. Existing Windsor data stays in its legacy tables for historical review;
it is not counted as native usage.

## Step 3 - Configure the Desktop App

The desktop app should use the public Supabase URL and publishable key.

Set these values in the app environment or in the packaged `.env`:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
```

The publishable key is enough for customers because the app can only call the restricted `taager_*` RPC functions.

## Step 4 - Configure the Admin Panel

Start the local admin server:

```bash
npm run admin
```

Then open:

```text
http://127.0.0.1:8787
```

Enter:

- Supabase URL
- Supabase service-role key

The admin panel manages licenses directly through the local server, so do not host this panel publicly and do not share the service-role key with customers.

Optional: create `admin-panel/admin.env` on your own machine so you do not type the key every time:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_or_secret_key
```

`admin-panel/admin.env` is ignored by git.

## Common Admin Actions

Generate a license:

1. Ask the customer for their Device ID.
2. Open **Generate Key**.
3. Enter the Device ID, customer name, expiry date, and max accounts.
4. Generate and send the key to the customer.

Reset a device:

1. Open **Reset Device**.
2. Enter the license key.
3. Reset the bound device so the customer can activate again.

Reset credentials:

1. Open **Reset Credentials**.
2. Enter the license key.
3. Reset the stored Taager account lock so the customer can save credentials again.

Revoke a license:

1. Open **Revoke License**.
2. Enter the license key.
3. Revoke it. The app will reject that license on future checks.

## Account Lock Behavior

| Situation | Result |
| --- | --- |
| Customer saves Taager credentials first time | Account is locked to the license in Supabase |
| Customer reuses the same credentials | Allowed |
| Customer tries different credentials while locked | Blocked |
| Admin unlocks credentials | Customer can save new credentials once |
| License expires | App blocks use |
| License is revoked | App blocks use |

## Security Notes

- The customer app uses the publishable key plus RPC functions.
- The admin panel uses the service-role key through `admin-panel/server.js` and must stay local/private.
- Do not add broad anon table policies back to `licenses` or `license_accounts`.
- Do not port Taager autoconfirm into Taager.
