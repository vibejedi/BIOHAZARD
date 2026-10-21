#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm ci --cache "${BIOHAZARD_NPM_CACHE:-/tmp/biohazard-npm-cache}" --no-audit --no-fund
node .devcontainer/restore-media.mjs
npm run server:prepare
npm run assets:validate
npm test
npm run build
