#!/bin/bash
# TilesERP VPS Deployment Script
# Run on VPS: ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

echo "═══════════════════════════════════════════"
echo "  TilesERP VPS Deployment"
echo "═══════════════════════════════════════════"

cd "$PROJECT_DIR"

echo "[1/5] Pulling latest code..."
git pull origin main

echo "[2/5] Building containers..."
docker compose -f "$COMPOSE_FILE" build --no-cache

echo "[3/5] Running database migrations..."
docker compose -f "$COMPOSE_FILE" up -d db
docker compose -f "$COMPOSE_FILE" exec db pg_isready -U tileserp -d tileserp
docker compose -f "$COMPOSE_FILE" run --rm --no-deps api sh -lc 'for i in $(seq 1 20); do node -e "require(\"dns\").lookup(\"db\", err => process.exit(err ? 1 : 0))" && break || sleep 2; done; npx knex migrate:latest --knexfile dist/db/knexfile.js'

echo "[4/5] Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

echo "[5/5] Verifying health..."
sleep 5
curl -sf http://localhost:4000/api/health || echo "⚠️  API health check failed"

echo ""
echo "═══════════════════════════════════════════"
echo "  Deployment complete!"
echo "═══════════════════════════════════════════"
docker compose -f "$COMPOSE_FILE" ps
