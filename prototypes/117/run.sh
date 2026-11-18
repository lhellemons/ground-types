#!/usr/bin/env bash
# PROTOTYPE #117 — typecheck the kit and the consumer port against the
# checked-out src/, then run the type and runtime probes.
#   prototypes/117/run.sh
# Nothing in src/ changes; the kit imports the library by relative path.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
echo "== typescript $(node_modules/.bin/tsc -v)"
node_modules/.bin/tsc -p prototypes/117/tsconfig.json
node_modules/.bin/vitest run --config prototypes/117/vitest.config.ts
