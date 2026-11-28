# Architecture decisions

Dated 2026-11-27.

## Garmin is the only training-data source; no Strava API

Strava's API Policy (effective 2026-06-01) bars putting Strava data into AI
models, limits caching to 7 days and bars combining it with other data.
https://www.strava.com/legal/api_policy

## Garmin through the Personal API, read only

The terms are shown only inside Garmin Connect when a key is made, so they were
not checked here: the athlete read them on 2026-11-28 and reports no clause on
AI use or passing data to other services. Re-check them when making a new key.

The key is swapped for a 24-hour bearer token at
`personal.connectapi.garmin.com`; there is no refresh token, so each sync asks
for one when the last has run out. The API reads data only; it cannot send
workouts to the watch. Its rate limits are undocumented, so a sync pauses
between pages of activities.

Garmin has no personal-records endpoint. Each activity in the list carries its
fastest split at set distances (`fastestSplit_5000` and so on, in seconds),
which is where bests come from. Only outdoor runs count: treadmill and indoor
distances are estimated. A split faster than 2:30 per km is dropped as a GPS
glitch. These are fastest stretches inside runs, not race results, so the coach
is told to prefer the athlete's own bests.

Garmin bests are stored with source "measured" and are read-only: each sync
replaces them, after everything has been fetched, in one transaction. They are
the only bests shown or sent to the coach; the form for typing bests in was
removed and the typed-in rows deleted on 2026-11-28. Race results are still
typed in. One snapshot row holds heart rate, zones and
VO2 max.

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

Tables that hold athlete metrics have a `source`: reported (typed in by the athlete),
measured, calculated or estimated.

A systemd user timer dumps the database daily to a second drive and keeps 30
(see the README). There is no off-machine copy yet.

`npm audit` reports a moderate esbuild advisory through drizzle-kit. It concerns
esbuild's development server, which drizzle-kit does not run.

## Coach replies stream as server-sent events

`POST /api/coach` sends `{"text"}` pieces and then `{"done"}` or `{"error"}`. The
reply comes from `src/server/coach/`: Claude when there is a key, else a mock.
The route checks the session and that the request's origin is this site, since
other apps on the same domain would otherwise be able to post with the cookie.
## Conversations are kept by the server

The browser sends only the new message. Earlier turns are read from
`coach_messages`, as text only, leaving out failed exchanges. The server holds
the reply as it streams, so a stopped one is saved too. Deleting a chat removes
its messages; database backups keep it until they age out.

Back and forward show a stored copy of a page, so a chat that has sent something
reloads itself when shown that way.

## The coach reads the profile through one tool

`get_profile` takes no arguments and returns everything except the name. It is
read only, called when advice needs it, and its result is not saved. A reply
that uses it is two API requests, each counted against the daily limit, and at
most four are made.

## Workouts are proposed, and only the athlete approves

`propose_workout` saves a workout as "proposed" and shows it as a card under the
reply. Approve and Decline are server actions; the coach has no tool that
approves, changes or schedules anything. Steps live in `workout_steps`, with one
level of repeats.

Rules in `src/server/workouts/rules.ts` reject a proposal, whatever the prompt
says: hard types (tempo, threshold, VO2max, hills, race-specific) while an
injury has no end date, a date in the past, a rest day, or more minutes than
that day allows (distance without a pace is timed at 6:00/km). Weekly volume and
back-to-back hard days are checked by the schedule rules below.

A proposal can name an earlier workout from the same chat that it revises. A
revision of a workout still waiting for a decision replaces it at once, and
declining the revision brings it back. An approved workout is replaced only when
its revision is approved, so the Workouts page lists one version.

The Studio (`/workouts/[id]`) edits a proposed or approved workout. An edit is
turned into the same input the coach sends and checked by the same code and
rules, except that a date the workout already had may stay once it has passed.
Saving an approved workout keeps it approved: the athlete made the change. The
coach sees the edited steps on its next reply.

Deleting a chat deletes its unapproved workouts; approved ones stay.

## The calendar works on date strings

`/calendar` shows approved workouts by week (Monday first) or month, with rest
days from availability and race dates from goals and race history. Dates are
`YYYY-MM-DD` strings with arithmetic in UTC (`src/lib/dates.ts`), and "today" is
the server's local date. Moving a workout is checked by the same rules as a
proposal and clears its done/skipped mark. A workout can be marked done or
skipped once its day has come; otherwise a Garmin run that day marks it done
(see below).

## Plans are split into blocks by date

A training plan has dates and an optional goal. Its blocks (base, build, peak,
taper, recovery, race) sit inside the plan's dates without overlapping, each
with an optional weekly-minutes target. A workout belongs to whichever block its
date falls in; nothing links them directly. Blocks have a status so the coach
can propose one later, but only approved blocks appear.

## Weeks are checked as a whole

`propose_week` shows a Monday-to-Sunday week as one card whose workouts are
ordinary proposals, approved one by one or all at once. `get_schedule` gives the
coach the calendar, blocks and weekly totals, read only.

Rules in `src/server/workouts/schedule.ts` apply whenever a dated workout is
proposed, approved, edited or moved, against approved workouts that were not
skipped: no hard sessions on consecutive days, at most three a week, each day
within its available minutes, and a week's planned time at most 10% (or 30
minutes) above the week before. The growth rule needs a baseline of 90 minutes
in the previous week, so it does not apply to the first weeks of planning. These
compare planned time, not what Garmin recorded.

## The coach proposes blocks and changes, never applies them

`propose_block` adds a block with status "proposed" to an existing plan; it
counts only once approved, and is checked again for fit at that moment.
`propose_changes` moves or cancels approved workouts as one set, recorded with
each workout's date at the time. Approving re-checks every change against the
rules and refuses the set if any workout has moved since. A cancelled workout
keeps its row with status "cancelled". The coach cannot create plans.

## Analytics are planned versus done, and what was run

`/analytics` shows eight weeks of approved workouts: planned and done time,
done and skipped counts, and the share of planned time in hard sessions, all
estimated from workout steps. Beside it, and never added to it, is what Garmin
recorded each week: runs, distance and time, and time in other sports.

## Garmin runs mark workouts done, without overwriting marks

Each sync replaces the `activities` table with an allowlist of fields from
Garmin's activity list (type, start, distance, time, elevation, heart rate,
cadence, load, training effect, time in zones); names of people, photos and
coordinates are not copied. Runs of every kind count here, treadmill included.

Whether a workout was done is worked out when it is read, not stored
(`src/lib/runs.ts`): the athlete's own mark wins; otherwise runs on the same day
are paired with workouts, longest with longest, and a matched workout is done.
Runs left over show as unplanned. So moving a workout, clearing a mark or
deleting a run in Garmin needs no clean-up. A workout marked skipped takes no
run. The calendar, analytics and the coach's `get_schedule` all use the same
result. The coach gets each run's distance, time, heart rate and load, never its
name or id.

Other sports (rides, walks, strength and so on) never mark a workout done.
They show on the calendar beside unplanned runs, as a separate Other column in
analytics, and to the coach per day and as weekly time by sport, labelled as
training stress rather than running.

Garmin's training load is missing on most older runs, so the coach gets it per
run where present and as a weekly total over those runs.

## Google Calendar: Aura writes its own calendar, and reads nothing

Google's Personal mode limits a client to the account that created it, needs no
verification, shows no unverified-app screen and is not subject to the 7-day
refresh-token expiry of External apps in Testing (support.google.com/cloud/
answer/15549945). A first External project was blocked as "being tested"; a
Personal one worked on 2026-11-28.

The only scope is `calendar.app.created`: Aura can make calendars and manage
events on them, and cannot see or change any other calendar. Reading the
athlete's events was built and then removed at their request, so no calendar
data reaches Claude. The refresh token is stored AES-256-GCM encrypted, keyed
from the client secret, so database dumps carry no usable token;
`invalid_grant` means connect again and is not retried.

Aura creates a calendar called Aura (recreated if deleted in Google) and keeps
one all-day event per approved, dated workout from a month back to a year
ahead, matched to its workout by a private extended property. Each update lists
the calendar's events and works out what to create, change and delete
(`src/server/google/calendar-sync.ts`); events Aura did not make, duplicates and
events for workouts no longer approved are deleted, and edits made in Google
are overwritten. Updates run a few seconds after any change to workouts,
after a Garmin sync, every hour, and from Sync now; never two at once, and
never in development or tests. The athlete's action never waits on Google: a
failure shows on the Calendar and the next run retries.

## Recovery data is shown and passed on, never scored

Each Garmin sync also reads sleep, HRV and the daily summary (resting heart
rate, stress, Body Battery) into `daily_wellness`, one row per date. A night
belongs to the morning it ended, as Garmin files it. The first sync reads 90
days; later ones re-read the last 14, since nights arrive and change late, and
replace exactly those dates in one transaction. Sleep is served in 28-day
requests at most. Numbers outside plausible ranges are dropped, Garmin's advice
texts are not copied, and an odd answer is an error rather than no data. This
runs after activities and PBs are saved, so its failure never undoes them; it
shows on the Calendar as a recovery-data error.

`/recovery` shows the last night, 7- and 28-day averages and two weeks of
days. Averages skip days without a reading and need 4 of 7 or 14 of 28 days;
today's resting heart rate, stress and Body Battery are left out of them
because the day is not over. Aura computes no readiness score: the coach gets
each past day's numbers, Garmin's HRV status and band, and the averages
through `get_schedule`, labelled as watch estimates, and is told to weigh a
trend with load and how the athlete feels rather than one reading.

## Garmin syncs on a timer inside the app

`src/instrumentation.ts` starts a timer when the production server starts; no
cron job or second service is needed, since one pm2 process serves the app. It
checks every ten minutes and syncs when the local hour is 06 to 22 and the last
attempt, failed or not, was two hours ago or more (the Aura calendar: one hour), so an expired key is tried
again only at the next slot. The button and the timer share one runner and
never sync at once. The last attempt is kept in memory and shown on the
Calendar; after a restart the timer goes by the last successful sync in the
database. Development and tests never start it, and `GARMIN_AUTO_SYNC=0` turns
it off.

## Claude Sonnet 5.5 through the Messages API

Chosen over Opus 5.5 for cost. Effort is `low`, replies are capped at 8000
tokens, and a request declined by a safety check falls back to another model.
The client is given its key and address explicitly, never from `ANTHROPIC_*`
variables. Every request reserves its worst-case cost in `coach_usage` before it
is sent, which bounds spending even across restarts. Tests never call Claude.

## Deploy starts the app with a clean environment

pm2 stores the environment of whoever starts an app. `scripts/deploy.sh` deletes
and starts `aura` with only `HOME`, `USER`, `PATH` and `LANG`.

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
