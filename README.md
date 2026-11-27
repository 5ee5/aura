# Aura

A single-user AI running coach, self-hosted.

**Today:** password login, a profile you can edit (preferences, availability,
goals, personal bests, races, injuries) and a coach chat that returns a labelled
**mock** reply. There is no AI, Garmin or calendar connection yet.

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

## Run on the server

    npm run deploy              # builds, migrates, starts or restarts pm2 app "aura"
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

**Nothing is backed up automatically.** To take a copy of the data by hand:

    (umask 077; sudo -u postgres pg_dump -Fc aura > ~/aura-$(date +%F).dump)

To restore one over the current data:

    sudo -u postgres pg_restore --clean --if-exists -d aura < ~/aura-YYYY-MM-DD.dump

A dump contains personal and health information: keep it private and out of git.
`.env` is not in git either, and holds the password hash and database connection.

## Documentation

- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/decisions.md)
