#!/usr/bin/env bash
# ============================================================
# Detect running database containers in Docker/Coolify
# ============================================================
set -euo pipefail

echo "=== Detecting Database Containers ==="
echo ""

# PostgreSQL
echo "── PostgreSQL ──────────────────────"
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' 2>/dev/null | grep -i "postgres" || echo "  No PostgreSQL containers found"
echo ""

# Check native PostgreSQL
if command -v psql &>/dev/null; then
  echo "  Native PostgreSQL:"
  ss -tlnp | grep -E ':543[0-9]' || echo "    No ports listening"
fi
echo ""

# MySQL / MariaDB
echo "── MySQL / MariaDB ─────────────────"
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' 2>/dev/null | grep -iE "mysql|maria" || echo "  No MySQL/MariaDB containers found"
echo ""

# MongoDB
echo "── MongoDB ─────────────────────────"
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' 2>/dev/null | grep -i "mongo" || echo "  No MongoDB containers found"
echo ""

# Summary of all Docker containers
echo "── All Running Containers ──────────"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo "  Docker not available"
echo ""
echo "=== Detection Complete ==="
