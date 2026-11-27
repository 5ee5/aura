# Aura

A single-user AI running coach.

## Requirements

Node 24 or later and pm2. Docker, for the browser tests.

## Setup

    npm ci
    cp .env.example .env        # then set APP_URL
    npm run set-password        # prompts; stores a hash and a session secret

## Develop

    npm run dev      # http://localhost:3301
    npm run check    # lint, type check, unit tests, build, browser tests

## Run on the server

    npm run deploy              # builds into .next-prod, starts or restarts pm2 app "aura"
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
