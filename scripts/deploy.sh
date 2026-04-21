#!/bin/bash
# TilesERP VPS Deployment Script
# Run on VPS: ./deploy.sh

set -euo pipefail

PROJECT_DIR="/opt/tileserp"
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
docker compose -f "$COMPOSE_FILE" run --rm api npx knex migrate:latest --knexfile dist/db/knexfile.js

echo "[4/5] Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

echo "[5/5] Verifying health..."
sleep 5
curl -sf http://localhost:3013/api/health || echo "⚠️  API health check failed"

echo ""
echo "═══════════════════════════════════════════"
echo "  Deployment complete!"
echo "═══════════════════════════════════════════"
docker compose -f "$COMPOSE_FILE" ps
