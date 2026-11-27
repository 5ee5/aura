# Aura

A single-user AI running coach.

## Requirements

Node 24 or later. Docker with Compose to run it as a service.

## Setup

    cp .env.example .env
    npm ci

## Develop

    npm run dev      # http://localhost:3300
    npm run check    # lint, type check, tests, build

## Run on the server

    docker compose up -d --build

The app has no login yet, so it listens on localhost only. To view it from
another machine, forward the port: `ssh -L 3300:localhost:3300 you@server`.

## Documentation

- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/decisions.md)
