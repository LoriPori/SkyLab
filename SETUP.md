# Worker setup

This guide walks through deploying the SkyLab Cloudflare Worker (`worker.js`) on your own account.
Everything below uses the free tier. Replace every `<placeholder>` with your own value.

> [!NOTE]
> This is a template. Adjust names, domains and steps to match your own deployment.

## Contents

- [Prerequisites](#prerequisites)
- [1. Create the project](#1-create-the-project)
- [2. Create the D1 database](#2-create-the-d1-database)
- [3. Configure `wrangler.toml`](#3-configure-wranglertoml)
- [4. Set the allowed origins](#4-set-the-allowed-origins)
- [5. Secrets and variables](#5-secrets-and-variables)
- [6. Deploy](#6-deploy)
- [7. Point the front end at your worker](#7-point-the-front-end-at-your-worker)
- [Optional features](#optional-features)
- [Security operations](#security-operations)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account (free plan is enough)
- Node.js 18 or newer
- Wrangler: `npm install -g wrangler`, then `wrangler login`

## 1. Create the project

```bash
mkdir skylab-worker && cd skylab-worker
cp /path/to/worker.js ./worker.js
```

## 2. Create the D1 database

```bash
wrangler d1 create skylab-db
```

Copy the `database_id` printed by the command; you need it in the next step.

Save the schema below as `schema.sql` and apply it:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  password_salt TEXT,
  google_id TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  avatar_url TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  username TEXT,
  password_hash TEXT,
  password_salt TEXT,
  user_id TEXT,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,
  sends INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  name TEXT,
  lang TEXT,
  unit TEXT,
  created INTEGER,
  last_brief TEXT,
  last_alert INTEGER
);

-- Security layer
CREATE TABLE IF NOT EXISTS sec_rate (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sec_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_sec_events_kind_ts ON sec_events(kind, ts);

CREATE TABLE IF NOT EXISTS sec_bans (
  ip_hash TEXT PRIMARY KEY,
  until INTEGER NOT NULL DEFAULT 0,
  strikes INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sec_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```
Then, in your terminal, execute:

```bash
wrangler d1 execute skylab-db --remote --file=schema.sql
```

## 3. Configure `wrangler.toml`

```toml
name = "<your-worker-name>"
main = "worker.js"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"                      # must be exactly "DB"
database_name = "skylab-db"
database_id = "<your-database-id>"

[triggers]
crons = ["*/30 * * * *"]            # push notifications + database cleanup
```

The cron trigger is required: it sends the weather notifications and purges expired sessions, codes and security events.

## 4. Set the allowed origins

At the top of `worker.js`, edit `ALLOWED_RAW` so it lists **only** the sites that may call your API:

```js
const ALLOWED_RAW = [
  'https://<your-username>.github.io',
  'http://localhost:8000'           // remove in production if you do not need it
];
```

Requests to `/api/*` from any other origin receive `403`.

## 5. Secrets and variables

Set secrets with `wrangler secret put <NAME>` (you will be prompted for the value).

### Required

| Name | Type | Purpose |
|---|---|---|
| `SEC_SECRET` | secret | Random string used to HMAC IP addresses and email codes. Generate with `openssl rand -hex 32`. |
| `GOOGLE_CLIENT_ID` | variable | OAuth client ID for "Sign in with Google". Without it, Google sign-in is refused. |

### Email verification (sign-up codes)

| Name | Type | Purpose |
|---|---|---|
| `GMAIL_CLIENT_ID` | secret | OAuth client ID with the Gmail API enabled |
| `GMAIL_CLIENT_SECRET` | secret | Matching client secret |
| `GMAIL_REFRESH_TOKEN` | secret | Refresh token for the sending account (scope `gmail.send`) |
| `MAIL_FROM` | variable | Sender address, for example `<your-account>@gmail.com` |

Without these, sign-up fails with a "could not send verification email" error.

### Weather data

| Name | Type | Purpose |
|---|---|---|
| `OWM_KEY` | secret | OpenWeatherMap key (cloud, wind and temperature tiles) |
| `ATMO_KEY` | secret | Pollen API key |
| `OM_KEY` | secret | Optional Open-Meteo commercial key; the free endpoint is used when unset |

### Push notifications

| Name | Type | Purpose |
|---|---|---|
| `VAPID_PRIVATE_JWK` | secret | Private key as a JSON Web Key (single line) |
| `VAPID_PUBLIC` | variable | Public key, base64url |
| `VAPID_SUBJECT` | variable | `mailto:<your-email>` |
| `SITE_URL` | variable | URL opened when a notification is clicked |

Generate a VAPID key pair with this one-off script (`node vapid.mjs`):

```js
import { webcrypto as c } from 'node:crypto';
const k = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const jwk = await c.subtle.exportKey('jwk', k.privateKey);
const raw = Buffer.from(await c.subtle.exportKey('raw', k.publicKey)).toString('base64url');
console.log('VAPID_PUBLIC =', raw);
console.log('VAPID_PRIVATE_JWK =', JSON.stringify(jwk));
```

### Security (all optional)

| Name | Type | Purpose |
|---|---|---|
| `TURNSTILE_SECRET` | secret | Enables Cloudflare Turnstile on sign-up and sign-in |
| `ALERT_WEBHOOK` | variable | Where security alerts go: an `https://ntfy.sh/<topic>` URL, a Discord webhook or a Slack webhook |
| `TRUSTED_IPS` | variable | Comma-separated IPs exempt from honeypots and bans (put your own here) |
| `TRIPWIRE_LOCKDOWN` | variable | Set to `1` to let distributed-attack tripwires trigger a full lockdown. Off by default, because it can be abused as a denial-of-service lever. |
| `LOCKDOWN` | variable | Set to `1` to lock the whole system manually |
| `DEBUG_ROUTES` | variable | Set to `1` to enable the `/gibs-layer` diagnostic route. Leave unset in production. |

## 6. Deploy

```bash
wrangler deploy
```

Wrangler prints the worker URL, for example `https://<your-worker-name>.<your-subdomain>.workers.dev`.

Quick checks:

```bash
curl https://<your-worker-url>/storms            # should return JSON
curl -i -H "Origin: https://<your-username>.github.io" https://<your-worker-url>/api/auth/me
# expected: 401 "Não autenticado"
```

## 7. Point the front end at your worker

Replace the worker URL in the front-end files with your own. It appears in `early.js` (`var W=...`), in `app.js`, and in the `preconnect` line of `index.html`.

Then bump the cache name in `sw.js` (`const C='skylab-vN'`) so returning visitors download the new files.

## Optional features

### Canary session (database-leak tripwire)

Insert a fake session whose token is stored **in plain text**. Legitimate sessions are stored hashed, so nobody should ever present this value. If someone does, the worker assumes the database was read and enters lockdown.

```bash
wrangler d1 execute skylab-db --remote --command \
 "INSERT INTO sessions(token,user_id,expires_at) VALUES('<64 hex chars>','canary-1','2099-01-01T00:00:00.000Z')"
```

Generate the token with `openssl rand -hex 32`. Do not use it anywhere else.

### Turnstile

1. Create a widget in the Cloudflare dashboard (Turnstile).
2. Add the site key to the front end and run `wrangler secret put TURNSTILE_SECRET`.

## Security operations

**Lockdown.** In lockdown every route returns `503` and every session is deleted. There is deliberately no unlock endpoint. To unlock:

```bash
# 1. clear the stored flag
wrangler d1 execute skylab-db --remote --command "DELETE FROM sec_state WHERE key='lockdown'"
# 2. if LOCKDOWN=1 is set as a variable, remove it from wrangler.toml and redeploy
wrangler deploy
```

Investigate before unlocking, and rotate `SEC_SECRET` and any other secret you suspect was exposed.

**Bans.** Inspect or lift a ban:

```bash
wrangler d1 execute skylab-db --remote --command "SELECT ip_hash, strikes, until, reason FROM sec_bans ORDER BY updated_at DESC LIMIT 20"
wrangler d1 execute skylab-db --remote --command "DELETE FROM sec_bans WHERE ip_hash='<hash>'"
```

IPs are stored as HMAC hashes, not in clear text.

**Logs.**

```bash
wrangler tail
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `403 Origem não permitida` | Your site is missing from `ALLOWED_RAW` |
| `503 Serviço indisponível` on `/api/*` | The `DB` binding is missing or misnamed |
| `503 ... motivos de segurança` | Lockdown is active; see [Security operations](#security-operations) |
| Sign-up says it could not send the email | `GMAIL_*` secrets are missing or the refresh token expired |
| Google sign-in always fails | `GOOGLE_CLIENT_ID` is unset or does not match the front end |
| Notifications unavailable | One of `VAPID_PRIVATE_JWK`, `VAPID_PUBLIC`, `VAPID_SUBJECT` is missing |
| Clouds / wind / temperature tiles return `501` | `OWM_KEY` is not set |
| Pollen returns `501` | `ATMO_KEY` is not set |
| You banned yourself while testing | Add your IP to `TRUSTED_IPS`, or delete your row from `sec_bans` |
