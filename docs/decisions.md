# Architecture decisions

Dated 2026-11-27.

## Garmin is the only training-data source; no Strava API

Strava's API Policy (effective 2026-06-01) bars putting Strava data into AI
models, limits caching to 7 days and bars combining it with other data.
https://www.strava.com/legal/api_policy

## Garmin Personal API terms are unreviewed

Read them before building the integration, especially for AI restrictions.

## Self-hosted with pm2, published through Cloudflare Tunnel

The app runs from this repository under pm2 and listens on localhost only.
cloudflared is the only way in from outside (aura.5ee5.dev). This replaced an
earlier Docker Compose setup. The deployed build goes to `.next-prod`, so checks
and development never rebuild the files being served.

## One password, no authentication library

A scrypt hash and a signing secret live in `.env`. Sessions are signed cookies
lasting 30 days. Changing the password ends them all. Signing out clears the
cookie in that browser only; there is no server-side session list.

The proxy blocks unauthenticated requests. Every page and server action must
also call `requireSession()`, and every route handler `hasSession()`, answering
401 without it.

Login attempts are limited in memory to 5 per address and 50 in total per 15
minutes. The total limit means a flood of guesses can lock the owner out until
the window passes or the app restarts.

## Browser tests run in Docker

This server lacks the libraries headless Chromium needs.

## Dark theme only

There is no light theme or toggle. Colour tokens are in `src/app/globals.css`.
Barlow is downloaded from Google Fonts at build time and served by the app, so a
build needs network access.

The navigation lists only sections that exist. The coach is the home page.

## PostgreSQL on the server, Drizzle migrations

PostgreSQL 18 runs as a system service, not in Docker, and listens on localhost
only. Migrations are SQL files in `drizzle/`, applied by `npm run deploy` before
the app restarts, so each one must work with the code already running.
drizzle-kit has no database credentials, so `push` cannot touch real data.

Tables that hold metrics have a `source`: reported (typed in by the athlete),
measured, calculated or estimated.

A systemd user timer dumps the database daily to a second drive and keeps 30
(see the README). There is no off-machine copy yet.

`npm audit` reports a moderate esbuild advisory through drizzle-kit. It concerns
esbuild's development server, which drizzle-kit does not run.

## Coach replies stream as server-sent events

`POST /api/coach` sends `{"text"}` pieces and then `{"done"}`. The reply comes
from a mock in `src/server/coach/`; Claude will replace it behind the same type.
The route checks the session and that the request's origin is this site, since
other apps on the same domain would otherwise be able to post with the cookie.
Conversations are not saved yet.

## One athlete, edited on one page

A unique index allows only one row in `athletes`. People type kilometres and
`h:mm:ss`; the tables hold metres and seconds (`src/lib/units.ts`). Dates stay
`YYYY-MM-DD` strings so no time zone can shift them. Anything typed in is saved
with the source "reported". Each server action calls `requireSession()`.

Browser and database tests empty and use `aura_test`, and refuse any database
whose name does not end in `_test`. Test files run one at a time.

## Changes proposed by the model need approval

Claude gets read and propose tools. Only an explicit user action applies a
proposal. Training safety limits are enforced in code as well as in the prompt.

## TypeScript 6.0, not 7

The lint toolchain (typescript-eslint) supports TypeScript below 6.1.

## Cache Components off

Nearly every page is private and rendered per request.

## ESLint 9, although deprecated

eslint-plugin-react, used by eslint-config-next, does not yet accept ESLint 10.
