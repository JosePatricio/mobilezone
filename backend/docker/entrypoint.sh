#!/bin/sh
# Applies the database schema and the idempotent seed, then starts the given command.
set -e

echo "Waiting for the database and applying migrations..."
attempt=1
until alembic upgrade head; do
  if [ "$attempt" -ge 30 ]; then
    echo "Database not reachable after $attempt attempts, giving up." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Seeding permissions, default roles and the admin user (idempotent)..."
python -m app.infrastructure.database.seed

exec "$@"
