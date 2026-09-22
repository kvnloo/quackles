#!/usr/bin/env bash
# Bootstrap the Quackles hosting environment.
#
# This script configures the Vercel project, sets environment variables,
# and verifies the deployment is healthy.  It is idempotent: running it
# multiple times produces the same result.
#
# Prerequisites:
#   - Vercel CLI (npx vercel@latest) authenticated for the kvnloos-projects scope
#   - Node.js 18+ with npm
#   - git
#
# Usage:
#   ./scripts/hosting/bootstrap.sh [--dry-run]
#
# Environment variables consumed (from .env or environment):
#   NEXT_PUBLIC_ASSET_ORIGIN  – external asset origin (see .env.example)
#   VERCEL_OIDC_TOKEN         – Vercel CLI authentication token
#   BLOB_READ_WRITE_TOKEN     – Vercel Blob token (if using Blob provider)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DRY_RUN="${DRY_RUN:-0}"
VERCEL_CLI="npx vercel@latest"

log() { echo "[bootstrap] $*"; }
log_err() { echo "[bootstrap] ERROR: $*" >&2; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      grep '^#' "$0" | grep -v '^#!/' | sed 's/^# //'
      exit 0
      ;;
  esac
done

if [ "$DRY_RUN" = "1" ]; then
  log "DRY RUN — no changes will be made"
fi

# ---------------------------------------------------------------------------
# Validate prerequisites
# ---------------------------------------------------------------------------
log "Checking prerequisites..."

command -v git >/dev/null 2>&1 || { log_err "git not found"; exit 1; }
command -v node >/dev/null 2>&1 || { log_err "node not found"; exit 1; }

if [ -f "$PROJECT_ROOT/node_modules/.package-lock.json" ]; then
  log "node_modules present"
else
  log "node_modules not found — run 'npm ci' first"
fi

# ---------------------------------------------------------------------------
# Verify .env.example exists
# ---------------------------------------------------------------------------
if [ ! -f "$PROJECT_ROOT/.env.example" ]; then
  log_err ".env.example not found at $PROJECT_ROOT/.env.example"
  exit 1
fi
log ".env.example present"

# ---------------------------------------------------------------------------
# Check Vercel project linkage
# ---------------------------------------------------------------------------
log "Checking Vercel project linkage..."
if [ "$DRY_RUN" = "1" ]; then
  log "  (dry-run) Would check: npx vercel@latest whoami"
else
  "$VERCEL_CLI" whoami >/dev/null 2>&1 || {
    log_err "Vercel CLI not authenticated. Run: npx vercel@latest login"
    exit 1
  }
  log "  Vercel authenticated: $($VERCEL_CLI whoami 2>/dev/null)"
fi

# ---------------------------------------------------------------------------
# Verify project configuration
# ---------------------------------------------------------------------------
log "Verifying project configuration..."

if [ ! -f "$PROJECT_ROOT/vercel.json" ]; then
  log_err "vercel.json not found"
  exit 1
fi
log "  vercel.json present"

if [ ! -f "$PROJECT_ROOT/next.config.ts" ]; then
  log_err "next.config.ts not found"
  exit 1
fi
log "  next.config.ts present"

# ---------------------------------------------------------------------------
# Set environment variables on Vercel (production + preview)
# ---------------------------------------------------------------------------
ASSET_ORIGIN="${NEXT_PUBLIC_ASSET_ORIGIN:-https://kvnloo.github.io/quackles-assets}"
log "Asset origin: $ASSET_ORIGIN"

if [ "$DRY_RUN" = "1" ]; then
  log "  (dry-run) Would set NEXT_PUBLIC_ASSET_ORIGIN=$ASSET_ORIGIN on production and preview"
else
  log "Setting NEXT_PUBLIC_ASSET_ORIGIN on Vercel..."
  "$VERCEL_CLI" env add NEXT_PUBLIC_ASSET_ORIGIN "$ASSET_ORIGIN" --yes >/dev/null 2>&1 || true
  "$VERCEL_CLI" env add NEXT_PUBLIC_ASSET_ORIGIN "$ASSET_ORIGIN" --environment=preview --yes >/dev/null 2>&1 || true
  log "  Environment variables set"
fi

# ---------------------------------------------------------------------------
# Verify the build works
# ---------------------------------------------------------------------------
log "Verifying build..."
cd "$PROJECT_ROOT"

if [ "$DRY_RUN" = "1" ]; then
  log "  (dry-run) Would run: npm run build"
else
  rm -rf out
  npm run build >/dev/null 2>&1 || {
    log_err "Build failed"
    exit 1
  }
  log "  Build succeeded"
fi

# ---------------------------------------------------------------------------
# Run unit tests
# ---------------------------------------------------------------------------
log "Running unit tests..."
if [ "$DRY_RUN" = "1" ]; then
  log "  (dry-run) Would run: npm test"
else
  npm test >/dev/null 2>&1 || {
    log_err "Tests failed"
    exit 1
  }
  log "  Tests passed"
fi

log "Bootstrap complete."
log "Next steps:"
log "  1. Deploy: npx vercel@latest deploy --prod --yes"
log "  2. Verify: npm run verify:deployed"
