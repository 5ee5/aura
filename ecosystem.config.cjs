module.exports = {
  apps: [
    {
      name: "aura",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      // Localhost only: cloudflared is the sole way in from outside.
      args: "start -H 127.0.0.1 -p 3300",
      exec_mode: "fork",
      instances: 1,
      // Give up on a broken configuration instead of restarting forever.
      min_uptime: "10s",
      max_restarts: 3,
      env: {
        NODE_ENV: "production",
        NEXT_DIST_DIR: ".next-prod",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
};
