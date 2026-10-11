#!/usr/bin/env bash
# Downloads raw OpenStreetMap data for central Vadodara via the Overpass API.
# Output: tools/raw-overpass.json (gitignored, ~9 MB) — feed it to build-data.js.
#
# Data © OpenStreetMap contributors, licensed under ODbL 1.0.
# https://www.openstreetmap.org/copyright
set -euo pipefail
cd "$(dirname "$0")"

MIRRORS=(
  "https://lz4.overpass-api.de/api/interpreter"
  "https://overpass-api.de/api/interpreter"
  "https://overpass.kumi.systems/api/interpreter"
)

for url in "${MIRRORS[@]}"; do
  echo "Trying $url ..."
  if curl -s -X POST \
      -H "User-Agent: vadodara-map-builder/1.0" \
      --data-urlencode "data@query.overpass" \
      "$url" -o raw-overpass.json --max-time 170 \
    && [ "$(stat -c%s raw-overpass.json 2>/dev/null || stat -f%z raw-overpass.json)" -gt 1000000 ]; then
    echo "Saved raw-overpass.json ($(du -h raw-overpass.json | cut -f1))"
    exit 0
  fi
  echo "  ...failed or too small, trying next mirror"
  sleep 2
done

echo "All Overpass mirrors failed. Try again later, or query data manually:"
echo "  https://overpass-turbo.eu/  (paste tools/query.overpass)"
exit 1
