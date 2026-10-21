#!/usr/bin/env bash
# Run from any directory after configuring deploy/.env. Requires Git and Docker
# Engine with the Compose plugin; Node runs inside the image, not on the VPS.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v git >/dev/null
command -v docker >/dev/null
docker compose version >/dev/null
if [ ! -f deploy/.env ]; then
  echo 'Copy deploy/.env.example to deploy/.env and set GAME_HOST to your DNS hostname first.' >&2
  exit 1
fi
compose=(docker compose --env-file deploy/.env -f deploy/compose.yml)
"${compose[@]}" config --quiet
git fetch --no-tags --depth=1 origin gh-pages
media_commit=$(git rev-parse 'FETCH_HEAD^{commit}')
mkdir -p server-data
prepared_file=$(mktemp server-data/.dust2.XXXXXX)
trap 'rm -f "$prepared_file"' EXIT
git show "${media_commit}:local-game-assets/dust2.json" > "$prepared_file"
test -s "$prepared_file"
mv "$prepared_file" server-data/dust2.json
"${compose[@]}" build game
"${compose[@]}" run --rm --no-deps -T --entrypoint node game -e '
  const data = JSON.parse(require("node:fs").readFileSync(process.env.BIOHAZARD_MAP_DATA, "utf8"));
  if (!data.pointNodes?.length || !data.leafContents?.length || !data.nodes?.length) throw Error("Current Dust II collision data is required");
  console.log("Authoritative Dust II server data verified.");
'
"${compose[@]}" up -d --wait --wait-timeout 120
"${compose[@]}" ps
echo "Browser media source: ${media_commit}"
echo 'Next: check https://YOUR_GAME_HOST/healthz, then connect two browsers to wss://YOUR_GAME_HOST/ws.'
