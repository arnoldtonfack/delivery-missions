#!/bin/sh
set -e
echo "[entrypoint] Starting API..."

# Plateformes sans job de migration séparé (Render, Railway…) : RUN_MIGRATIONS=true
# applique les migrations en attente avant de démarrer. `migrate deploy` est
# idempotent et n'applique que les migrations déjà versionnées.
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "[entrypoint] Applying Prisma migrations..."
  npx --no-install prisma migrate deploy
fi

exec "$@"
