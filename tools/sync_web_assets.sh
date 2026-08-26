#!/usr/bin/env bash
# Copy the shared catalog into the web build. Run after changing anything in
# app/src/main/assets, so docs/ never drifts from what the apps ship.
set -euo pipefail
cd "$(dirname "$0")/.."
cp app/src/main/assets/{spots.json,cams.json,airports.json,world_land.json} docs/data/
echo "synced $(ls docs/data | wc -l) asset files into docs/data"
