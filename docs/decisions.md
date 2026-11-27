# Architecture decisions

Dated 2026-11-27.

## Garmin is the only training-data source; no Strava API

Strava's API Policy (effective 2026-06-01) bars putting Strava data into AI
models, limits caching to 7 days and bars combining it with other data.
https://www.strava.com/legal/api_policy

## Garmin Personal API terms are unreviewed

Read them before building the integration, especially for AI restrictions.

## Self-hosted, localhost until login exists

The app runs from this repository on the owner's server. Nothing listens beyond
localhost until there is a login.

## Changes proposed by the model need approval

Claude gets read and propose tools. Only an explicit user action applies a
proposal. Training safety limits are enforced in code as well as in the prompt.

## TypeScript 6.0, not 7

The lint toolchain (typescript-eslint) supports TypeScript below 6.1.

## Cache Components off

Nearly every page is private and rendered per request.

## ESLint 9, although deprecated

eslint-plugin-react, used by eslint-config-next, does not yet accept ESLint 10.
