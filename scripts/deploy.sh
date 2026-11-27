#!/bin/sh
# Build, migrate, and start pm2 app "aura" with a clean environment.
set -eu
cd "$(dirname "$0")/.."
NEXT_DIST_DIR=.next-prod npx next build
node scripts/migrate.ts
# pm2 gives an app the environment of whoever started it, and keeps it across
# restarts. So remove the app and start it with only what it needs; settings come
# from .env.
pm2 delete aura >/dev/null 2>&1 || true
env -i HOME="$HOME" USER="${USER:-$(id -un)}" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
  pm2 start ecosystem.config.cjs --only aura
echo "Run 'pm2 save' if the app list changed since you last saved it."
