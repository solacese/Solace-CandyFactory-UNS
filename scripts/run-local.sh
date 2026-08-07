#!/usr/bin/env bash
#
# run-local.sh — one command to run the CandyFactory kiosk locally with a live
# arm feed.
#
# It brings up the Solace broker, creates the demo client user, and starts the
# kiosk in LIVE mode (non-loopback) so the ARM tab shows the real 3D arm driven
# by telemetry — as opposed to the GitHub Pages build, which shows a video.
#
# Usage:
#   ./scripts/run-local.sh            # broker + kiosk (live 3D arm)
#   ./scripts/run-local.sh --no-kiosk # just the broker + demo user
#   SOLACE_SMF_PORT=55556 ./scripts/run-local.sh   # if :55555 is taken
#
# The arm-bridge (physical SO-101) is started separately — see the hint printed
# at the end, or packages/arm-bridge/README.md.
#
set -euo pipefail

# ─── Paths ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.solace.yml"
KIOSK_DIR="$ROOT_DIR/packages/kiosk"

# ─── Config ─────────────────────────────────────────────────────
SEMP_URL="http://localhost:8080/SEMP/v2/config/msgVpns/default/clientUsernames"
SEMP_AUTH="admin:admin"
CLIENT_USER="haribot"
CLIENT_PASS="haribot"
START_KIOSK=1

for arg in "$@"; do
  case "$arg" in
    --no-kiosk) START_KIOSK=0 ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ─── Prerequisites ──────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker not found — install Docker Desktop."
docker compose version >/dev/null 2>&1 || die "'docker compose' not available — update Docker."
docker info >/dev/null 2>&1 || die "Docker daemon not running — start Docker Desktop."

# ─── 1. Broker ──────────────────────────────────────────────────
log "Starting Solace broker (docker compose)…"
docker compose -f "$COMPOSE_FILE" up -d

log "Waiting for the broker SEMP API (:8080) to come up (cold boot can take a few minutes)…"
for i in $(seq 1 120); do
  if curl -fsS -u "$SEMP_AUTH" "$SEMP_URL?count=1" >/dev/null 2>&1; then
    break
  fi
  [ "$i" -eq 120 ] && die "Broker did not become ready within ~4 min. Check: docker compose -f $COMPOSE_FILE logs"
  sleep 2
done
log "Broker is up."

# ─── 2. Demo client user (idempotent) ───────────────────────────
log "Ensuring client user '$CLIENT_USER' exists…"
code=$(curl -s -o /dev/null -w '%{http_code}' -u "$SEMP_AUTH" -X POST "$SEMP_URL" \
  -H "Content-Type: application/json" \
  -d "{\"clientUsername\":\"$CLIENT_USER\",\"password\":\"$CLIENT_PASS\",\"enabled\":true}" || true)
case "$code" in
  200|201) log "Created client user '$CLIENT_USER'." ;;
  400)     log "Client user '$CLIENT_USER' already exists — ok." ;;
  *)       warn "Unexpected SEMP response ($code) creating user; continuing." ;;
esac

# ─── 3. Kiosk env ───────────────────────────────────────────────
if [ ! -f "$KIOSK_DIR/.env.local" ]; then
  log "Creating kiosk .env.local from example…"
  cp "$KIOSK_DIR/.env.local.example" "$KIOSK_DIR/.env.local"
fi

if [ "$START_KIOSK" -eq 0 ]; then
  log "Broker ready. Skipping kiosk (--no-kiosk)."
  echo
  echo "  Kiosk (live 3D arm):  cd packages/kiosk && npm install && npm run dev"
  echo "  Arm bridge:           cd packages/arm-bridge && python bridge.py"
  exit 0
fi

# ─── 4. Kiosk (live, non-loopback) ──────────────────────────────
if [ ! -d "$KIOSK_DIR/node_modules" ]; then
  log "Installing kiosk dependencies (first run)…"
  (cd "$KIOSK_DIR" && npm install)
fi

echo
log "Starting kiosk in LIVE mode (non-loopback → live 3D arm)."
echo "    → http://localhost:3005"
echo "    → Plug in the SO-101 and run the bridge to drive the arm:"
echo "        cd packages/arm-bridge && python bridge.py"
echo "    (No hardware? The ARM tab streams the simulated pose until real telemetry arrives.)"
echo
# VITE_LOOPBACK is intentionally unset here — that is what selects the live feed.
cd "$KIOSK_DIR"
exec npm run dev
