#!/usr/bin/env bash
# PROTOTYPE #59 — typecheck the arms against src/ on main, run the probes,
# then count the declaration-emit errors (TS4050) per file: a factory whose
# inferred Result names the private phantom markers cannot be emitted into
# a .d.ts. Any other emit error fails the run.
#   prototypes/59/run.sh
# Nothing in src/ changes; the arms import the library by relative path.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
OUT=$(mktemp -d "${TMPDIR:-/tmp}/proto59.XXXXXX")
trap 'rm -rf "$OUT"' EXIT
echo "== typescript $(node_modules/.bin/tsc -v)"
node_modules/.bin/tsc -p prototypes/59/tsconfig.json
node_modules/.bin/vitest run --config prototypes/59/vitest.config.ts
echo "== declaration emit (TS4050 per file)"
EMIT=$(node_modules/.bin/tsc -p prototypes/59/tsconfig.json --declaration --emitDeclarationOnly --noEmit false --outDir "$OUT/dts" 2>&1 || true)
TS4050=$(printf '%s\n' "$EMIT" | grep 'error TS4050' | grep -o 'prototypes/59/[a-z-]*\.ts' | sort | uniq -c || true)
OTHER=$(printf '%s\n' "$EMIT" | grep 'error TS' | grep -v 'error TS4050' || true)
if [ -n "$OTHER" ]; then
  printf '%s\n' "$OTHER" >&2
  echo "declaration emit failed with an error other than TS4050" >&2
  exit 1
fi
[ -n "$TS4050" ] && printf '%s\n' "$TS4050" || echo "   none"
