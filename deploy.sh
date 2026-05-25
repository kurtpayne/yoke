#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Building client..."
cd client && bun run build.ts && cd ..

echo "Building worker..."
cd worker && bun run build && cd ..

echo "Deploying..."
cd worker && npx wrangler deploy

echo "✅ Deployed to yoke.lol"
