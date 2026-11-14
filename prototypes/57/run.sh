#!/usr/bin/env bash
# PROTOTYPE #57 — measure one arm: apply its patch, drop the probes into
# src/result, run the full suite, then restore the tree.
#   prototypes/57/run.sh <main|a|b> [typescript version]
set -u
ARM=$1; TSV=${2:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd); cd "$ROOT"
[ "$ARM" != main ] && git apply "prototypes/57/arm-$ARM.patch"
cp prototypes/57/probe.test-d.ts src/result/proto57.test-d.ts
cp prototypes/57/probe-b.test-d.ts src/result/proto57b.test-d.ts
[ -n "$TSV" ] && pnpm add -D "typescript@$TSV" >/dev/null 2>&1
echo "== arm $ARM, typescript $(node_modules/.bin/tsc -v)"
pnpm vitest run 2>&1 | grep -E "FAIL|✓|×|Test Files|Tests |Type Errors|error TS|proto57|Error:" | grep -v "^ *✓" | head -60
rm -f src/result/proto57.test-d.ts src/result/proto57b.test-d.ts
[ -n "$TSV" ] && git checkout -- package.json pnpm-lock.yaml && pnpm install --frozen-lockfile >/dev/null 2>&1
[ "$ARM" != main ] && git checkout -- src/
git status --short
