#!/bin/bash
# Seed reference data into Cloudflare KV namespace REFERENCE_DATA
# Usage: bash scripts/seed-kv.sh
#
# Currently a placeholder — actual seeding will happen when:
#   1. retire.js DB is integrated (downloads from GitHub, converts to JSON, writes to KV)
#   2. Third-party script patterns are offloaded from bundle to KV
#   3. NS provider mapping is optionally moved to KV
#
# The curated vulnerable-libraries.ts and ns-providers.ts stay in-bundle for scoring;
# KV stores the extended reference data for dedicated analysis endpoints.

set -euo pipefail
cd "$(dirname "$0")/.."

# Load Cloudflare credentials
set -a && source /home/hatch/.wrangler/.env && set +a
export PATH="/home/hatch/.local/node22/bin:$PATH"

KV_NAMESPACE_ID="aba8639ff0b945598ccc6ff2730656da"

echo "=== Yoke KV Reference Data Seeder ==="
echo ""

# ── retire.js DB ───────────────────────────────────────────────────
# TODO: Download retire.js repo DB from GitHub, transform to JSON, write to KV
# Key: "retirejs-db"
# Schedule: weekly (Sunday maintenance cron)
echo "⏭️  retire.js DB — not yet implemented"

# ── Third-party script patterns ──────────────────────────────────
# TODO: Offload third-party script patterns from bundle to KV
# Key: "third-party-patterns"
echo "⏭️  Third-party patterns — not yet implemented"

# ── NS provider mapping ─────────────────────────────────────────
# The ns-providers.ts map (~2KB) is fine in-bundle for now
# Could be moved to KV if it grows significantly
echo "⏭️  NS providers — staying in-bundle for now"

echo ""
echo "✅ KV seed complete (placeholders only — real data seeding coming soon)"
