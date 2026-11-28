# Aura

A single-user AI running coach, self-hosted.

**Today:** password login, a profile you can edit (preferences, availability,
goals, races, injuries) and a coach chat with Claude. Without an
API key the chat returns a labelled **mock** reply. Chats are saved and can be
reopened or deleted. The coach can read your profile, and propose workouts that
you approve or decline; approved ones are listed under Workouts. Any current
workout can be edited step by step in the Studio, scheduled on the Calendar,
and marked done or skipped. Plans split the season into blocks, and the coach can propose a whole week, a block, or changes to the calendar.
With a Garmin key, a sync reads your runs, fastest efforts, heart rate, zones
and VO2 max from Garmin Connect. A run on the day of a planned workout marks it
done. There is no calendar connection.

## Requirements

- Node 24 or later, and pm2
- PostgreSQL 18, listening on localhost
- Docker, only for the browser tests
- Network access at build time, to download the font

## Setup

### 1. Code

    npm ci
    cp .env.example .env

In `.env`, set `APP_URL` to the address you will open: the public `https` one on
a server. Cookies are marked secure only when it starts with `https:`.

### 2. PostgreSQL

On Gentoo with systemd (use your own system's equivalent elsewhere):

    sudo emerge --ask dev-db/postgresql:18
    sudo emerge --config dev-db/postgresql:18
    sudo systemctl enable --now postgresql-18

Check `/etc/postgresql-18/pg_hba.conf`. Gentoo's setup may leave every line as
`trust`, which lets anyone on the machine in without a password:

    sudo sed -i.bak -E '/^local/s/trust[[:space:]]*$/peer/; /^host/s/trust[[:space:]]*$/scram-sha-256/' /etc/postgresql-18/pg_hba.conf
    sudo systemctl reload postgresql-18

Create the user and its two databases, and add the connection to `.env`. Run this
in the project folder, as one block:

    PW=$(openssl rand -hex 24)
    echo "CREATE ROLE aura LOGIN PASSWORD '$PW';" | sudo -u postgres psql -v ON_ERROR_STOP=1 &&
    sudo -u postgres createdb -O aura aura &&
    sudo -u postgres createdb -O aura aura_test &&
    sed -i '/^DATABASE_URL=/d' .env &&
    printf 'DATABASE_URL=postgresql://aura:%s@127.0.0.1:5432/aura\n' "$PW" >> .env
    unset PW

`aura` holds your data. **`aura_test` is emptied by every test run.**

### 3. Password and tables

    npm run set-password        # prompts; stores a hash and a session secret
    npm run db:migrate

## The coach

1. Create a key at console.anthropic.com and set a monthly spend limit there.
   API use is billed separately from a Claude subscription.
2. Put it in `.env` as `ANTHROPIC_API_KEY=...`, then `pm2 restart aura`.

What you type is saved in the database and sent to Anthropic. So is your profile
whenever the coach reads it, injuries and Garmin numbers included (your name is not), and your
calendar, plan and race names and your Garmin runs (distance, time, heart rate,
load) when it reads the schedule. Replies that
did are marked "read your profile". `COACH_DAILY_BUDGET_USD` (default 2) caps
what the app spends in any 24 hours, using its own estimate; stopped replies
count at the most they could have cost. `npm run dev` uses the real key too; set
`COACH_MOCK=1` to avoid spending.

## Garmin

1. In Garmin Connect, open Profile & Account, Settings, Personal API Key. Choose
   the longest expiry (one year); the key is shown once.
2. Put it in `.env` as `GARMIN_API_KEY=...`, then `pm2 restart aura`.
3. Press Sync now on the Calendar, or Sync from Garmin on the Profile page.
   Sync is manual for now.

A sync reads your activity list, heart-rate zones and the last 90 days of VO2
max. Every activity is stored with its type, start, distance, time, elevation,
heart rate, cadence and load, not its location. A run on the day of a planned
workout marks that workout done unless you marked it yourself; other runs show
as unplanned on the Calendar. Aura keeps the fastest 1 km, mile, 5 km, 10 km, half and marathon inside
outdoor runs (treadmill and indoor runs are left out), plus max, resting and
threshold heart rate. These are the only personal bests Aura shows; there is
no form to type them in. The coach reads them with your profile, so they go to Anthropic too.
When the key expires, the sync says so: make a new one.

## Run on the server

    npm run deploy              # builds, migrates, restarts pm2 app "aura" afresh
    pm2 save                    # saves the list of all pm2 apps, for reboots
    pm2 startup                 # once per machine; run the command it prints

The app listens on 127.0.0.1:3300 only. To publish it with a Cloudflare Tunnel,
add this above the catch-all rule in the tunnel's `config.yml`, point the DNS
name at the tunnel and restart `cloudflared`:

    - hostname: aura.example.com
      service: http://localhost:3300

Deploy builds whatever is checked out, so check the branch first.

## Develop

    npm run dev      # http://localhost:3301
    npm run check    # lint, type check, tests, build, browser tests

- `npm run dev` uses the database in `.env`. On the server that is your real data.
- `npm run check` needs PostgreSQL and Docker. `npm test` needs PostgreSQL.
- After changing `src/server/db/schema.ts`, run `npm run db:generate` and commit
  what it writes to `drizzle/`.
- This Next.js version differs from older ones. Its documentation is in
  `node_modules/next/dist/docs/`.

| Path | Holds |
|---|---|
| `src/app/` | Pages, and the chat endpoint in `api/coach` |
| `src/components/` | Shared interface parts |
| `src/server/` | Server only: auth, coach, database, profile |
| `src/lib/` | Code shared by browser and server |
| `drizzle/` | SQL migrations |
| `e2e/` | Browser tests |

## Day to day

| Task | How |
|---|---|
| Read logs | `pm2 logs aura` |
| Change the password (signs out everywhere) | `npm run set-password`, then `pm2 restart aura` |
| "Too many attempts" at login | Wait 15 minutes, or `pm2 restart aura` |
| App will not start | `pm2 logs aura` names the missing or bad `.env` variable |
| "Something went wrong" on a page | Check `systemctl status postgresql-18` and the logs |

## Backups

A timer dumps the database daily at 03:30 and keeps the newest 30. Set it up once:

    mkdir -p /mnt/data/backups
    mkdir -m 700 /mnt/data/backups/aura

Add to `.env` (choose a drive other than the one holding the database, and a
folder no container or file share can read):

    BACKUP_DIR=/mnt/data/backups/aura
    BACKUP_MOUNT=/mnt/data

Then, from the project folder:

    mkdir -p ~/.config/systemd/user
    cp ops/aura-backup.service ops/aura-backup.timer ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user enable --now aura-backup.timer
    loginctl enable-linger          # so it runs while you are logged out

| Task | Command |
|---|---|
| Back up now | `systemctl --user start aura-backup` |
| See the last run and any error | `systemctl --user status aura-backup` |
| See the next run | `systemctl --user list-timers aura-backup.timer` |

**Nothing alerts you if a backup fails**, so check now and then. The timer runs
the code that is checked out in the project folder.

To restore, replacing the current data (the password is the one in
`DATABASE_URL`):

    pg_restore --clean --if-exists -h 127.0.0.1 -U aura -d aura /mnt/data/backups/aura/aura-DATE.dump

Dumps contain personal and health information: keep them private and out of git.

**Limits:** a second drive in the same machine does not protect against losing
the machine. `.env` is not backed up; after a loss, set the password and database
connection up again.

## Documentation

- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/decisions.md)
