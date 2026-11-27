# Aura

A single-user AI running coach.

## Requirements

Node 24 or later, pm2 and PostgreSQL 18. Docker, for the browser tests.

## Setup

    npm ci
    cp .env.example .env        # then set APP_URL
    npm run set-password        # prompts; stores a hash and a session secret

### Database

Create a user `aura` that is not a superuser, and two databases it owns: `aura`
and `aura_test`. Put `DATABASE_URL` in `.env`, then run `npm run db:migrate`.
Require passwords for TCP connections in `pg_hba.conf` (`scram-sha-256`, not
`trust`). `npm run check` empties `aura_test` every time.

After changing `src/server/db/schema.ts`, run `npm run db:generate` and commit
the SQL it writes to `drizzle/`.

## Develop

    npm run dev      # http://localhost:3301
    npm run check    # lint, type check, unit tests, build, browser tests

## Run on the server

    npm run deploy              # builds, migrates the database, restarts pm2 app "aura"
    pm2 logs aura
    pm2 save                    # once, so it returns after a reboot (saves every pm2 app)

The app listens on 127.0.0.1:3300 only. Publish it with a Cloudflare Tunnel
ingress rule pointing at `http://localhost:3300`, with `APP_URL` set to the
public https address.

To change the password, run `npm run set-password`, then `pm2 restart aura`.
This signs out every session.

## Documentation

- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/decisions.md)
