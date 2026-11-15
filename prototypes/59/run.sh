#!/usr/bin/env bash
# PROTOTYPE #59 — typecheck the arms against src/ on main, run the probes,
# then count the declaration-emit errors (TS4050) per arm: an un-annotated
# factory whose inferred Result names the private phantom markers cannot be
# emitted into a .d.ts.
#   prototypes/59/run.sh
# Nothing in src/ changes; the arms import the library by relative path.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
echo "== typescript $(node_modules/.bin/tsc -v)"
node_modules/.bin/tsc -p prototypes/59/tsconfig.json
node_modules/.bin/vitest run --config prototypes/59/vitest.config.ts
echo "== declaration emit (TS4050 per file)"
node_modules/.bin/tsc -p prototypes/59/tsconfig.json --declaration --emitDeclarationOnly --noEmit false --outDir "${TMPDIR:-/tmp}/proto59-dts" 2>&1 \
  | grep -o 'prototypes/59/[a-z-]*\.ts' | sort | uniq -c || echo "   none"
