#!/bin/sh
# Browser tests in Playwright's image, so the host needs no browser libraries.
# Build first (npm run build). The test server listens on localhost only.
set -eu
cd "$(dirname "$0")/.."
version=$(node -p 'require("@playwright/test/package.json").version')
exec docker run --rm --network host --ipc host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e NEXT_TELEMETRY_DISABLED=1 \
  -v "$PWD:/work" -w /work \
  "mcr.microsoft.com/playwright:v$version-noble" npx playwright test "$@"
