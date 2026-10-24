# Security Policy

SkyLab handles user accounts, so security reports are taken seriously. Thank you for helping keep the project and its users safe.

## Reporting a vulnerability

**Please do not open a public issue or pull request for a security problem.**

Email **skylab.support@gmail.com** with the subject line `Security: <short summary>` and include:

- a description of the issue and its potential impact
- steps to reproduce, or a proof of concept
- the affected component (front end, worker, a specific endpoint)
- your name or handle if you would like to be credited

You can expect:

- an acknowledgement within **7 days**
- a status update once the report has been assessed
- a fix, or an explanation if the report is not considered a vulnerability
- credit in the release notes if you want it

SkyLab is a personal project maintained by one person, so response times may vary. Reports are handled on a best-effort basis.

## Supported versions

Only the latest version, deployed at <https://loripori.github.io/SkyLab/>, receives security fixes.

## Scope

In scope:

- the web app (`index.html`, `app.js`, `early.js`, `sw.js`)
- the Cloudflare Worker (`worker.js`) and its `/api/*` endpoints
- authentication, sessions, email verification and push subscriptions
- exposure of user data stored in the database

Out of scope:

- vulnerabilities in third-party services (Open-Meteo, NASA GIBS, RainViewer, OpenWeatherMap, IPMA, NHC, GDACS, PollenAPI, Google, Cloudflare); please report those to the provider
- denial-of-service through sheer traffic volume
- automated scanner output with no demonstrated impact
- missing security headers on static GitHub Pages files that the project cannot control
- social engineering, physical attacks, or attacks needing a compromised device

## Testing guidelines

Please:

- test only against your own account and data
- avoid accessing, changing or deleting other users' data
- avoid degrading the service for other people
- give a reasonable amount of time to fix the issue before disclosing it

Automated scanning against the production worker may trigger rate limits and temporary blocks. This is expected behaviour, not a bug.

## Security measures in place

A summary of the main protections, so you know what has already been considered:

- **Passwords** are salted and hashed with PBKDF2-SHA256, and checked against known data breaches (k-anonymity, so the full password never leaves the worker).
- **Session tokens** are random 256-bit values; only a hash is stored in the database, and sessions expire after 14 days.
- **Email verification** uses single-use, time-limited codes with an attempt limit. Accounts are created only after the code is confirmed.
- **Google sign-in** tokens are validated server-side against the configured client ID.
- **Rate limiting** applies to authentication and other sensitive endpoints, and repeated abuse leads to progressive temporary blocks.
- **CORS and origin checks** restrict `/api/*` to the official site.
- **Security headers** are set on every response, and error messages are kept generic.
- **Input validation** and size limits apply to all request bodies.
- **Account deletion** removes the user, sessions, preferences and push subscriptions.

## Safe harbour

Good-faith research that follows this policy will not be pursued legally. If you are unsure whether something is allowed, ask first by email.
