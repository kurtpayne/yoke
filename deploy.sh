#!/bin/bash
set -e
cd "$(dirname "$0")"

# ── Usage ────────────────────────────────────────────────────────────
usage() {
  echo "Usage: bash deploy.sh <target>"
  echo ""
  echo "Targets:"
  echo "  --all   Deploy Cloudflare Worker + Fly probe"
  echo "  --cf    Deploy Cloudflare Worker only"
  echo "  --fly   Deploy Fly.io probe only"
  echo ""
  echo "Examples:"
  echo "  bash deploy.sh --all"
  echo "  bash deploy.sh --cf"
  echo "  bash deploy.sh --fly"
  exit 1
}

# ── Parse flags ──────────────────────────────────────────────────────
DEPLOY_CF=false
DEPLOY_FLY=false

if [[ $# -eq 0 ]]; then
  usage
fi

for arg in "$@"; do
  case "$arg" in
    --all) DEPLOY_CF=true; DEPLOY_FLY=true ;;
    --cf)  DEPLOY_CF=true ;;
    --fly) DEPLOY_FLY=true ;;
    *)     echo "Unknown flag: $arg"; echo ""; usage ;;
  esac
done

# ── Cloudflare Worker ────────────────────────────────────────────────
if $DEPLOY_CF; then
  echo "🔨 Building client..."
  cd client && bun run build.ts && cd ..

  echo "🔨 Building worker..."
  cd worker && bun run build && cd ..

  echo "🚀 Deploying to Cloudflare..."
  cd worker && npx wrangler deploy && cd ..

  echo "✅ Cloudflare Worker deployed"
fi

# ── Fly.io Probe ─────────────────────────────────────────────────────
if $DEPLOY_FLY; then
  if ! command -v fly &>/dev/null; then
    echo "❌ fly CLI not found. Install it: curl -L https://fly.io/install.sh | sh"
    exit 1
  fi

  echo "🚀 Deploying Fly probe..."
  cd fly-proxy && fly deploy && cd ..

  echo "✅ Fly probe deployed"
fi

echo ""
echo "🐂 Done."
