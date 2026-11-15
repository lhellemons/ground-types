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
set +e
EMIT=$(node_modules/.bin/tsc -p prototypes/59/tsconfig.json --declaration --emitDeclarationOnly --noEmit false --outDir "$OUT/dts" 2>&1)
CODE=$?
set -e
TS_LINES=$(printf '%s\n' "$EMIT" | grep -c 'error TS' || true)
TS4050_LINES=$(printf '%s\n' "$EMIT" | grep -c 'error TS4050' || true)
COUNTED_LINES=$(printf '%s\n' "$EMIT" | grep 'error TS4050' | grep -c 'prototypes/59/[a-z-]*\.ts' || true)
case "$CODE" in
  0 | 1 | 2) ;;
  *)
    printf '%s\n' "$EMIT" >&2
    echo "declaration emit: tsc exited $CODE" >&2
    exit 1
    ;;
esac
if [ "$CODE" -ne 0 ] && [ "$TS_LINES" -eq 0 ]; then
  printf '%s\n' "$EMIT" >&2
  echo "declaration emit: tsc exited $CODE with no diagnostics" >&2
  exit 1
fi
if [ "$TS_LINES" -ne "$TS4050_LINES" ] || [ "$COUNTED_LINES" -ne "$TS4050_LINES" ]; then
  printf '%s\n' "$EMIT" | grep 'error TS' >&2
  echo "declaration emit: an error other than a TS4050 under prototypes/59" >&2
  exit 1
fi
if [ "$TS4050_LINES" -eq 0 ]; then
  echo "   none"
else
  printf '%s\n' "$EMIT" | grep 'error TS4050' | grep -o 'prototypes/59/[a-z-]*\.ts' | sort | uniq -c
fi
