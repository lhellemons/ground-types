#!/usr/bin/env bash
# PROTOTYPE #57 — measure one arm in a temporary git worktree of HEAD: apply
# its patch, drop the probes into src/result, run the full suite. The main
# checkout is never touched.
#   prototypes/57/run.sh <main|a|b1|b> [typescript version]
set -euo pipefail
ARM=${1:?arm: main, a, b1 or b}
TSV=${2:-}
case "$ARM" in main | a | b1 | b) ;; *) echo "unknown arm: $ARM" >&2; exit 2 ;; esac
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WT=$(mktemp -d "${TMPDIR:-/tmp}/proto57.XXXXXX")
cleanup() {
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  rm -rf "$WT"
}
trap cleanup EXIT
git -C "$ROOT" worktree add --detach "$WT" HEAD >/dev/null 2>&1
cd "$WT"
[ "$ARM" != main ] && git apply "prototypes/57/arm-$ARM.patch"
cp prototypes/57/probe.test-d.ts src/result/proto57.test-d.ts
cp prototypes/57/probe-b.test-d.ts src/result/proto57b.test-d.ts
# Reuse the main checkout's dependencies; only a different TypeScript is
# installed, and then only in the worktree. `--ignore-scripts` keeps
# `prepare` (the build) from running against a patched source that is
# meant to fail typecheck.
[ -d "$ROOT/node_modules" ] || { echo "run pnpm install in $ROOT first" >&2; exit 2; }
ln -s "$ROOT/node_modules" node_modules
if [ -n "$TSV" ]; then
  rm node_modules
  pnpm install --frozen-lockfile --ignore-scripts >/dev/null
  pnpm add -D --ignore-scripts "typescript@$TSV" >/dev/null
fi
echo "== arm $ARM, typescript $(node_modules/.bin/tsc -v)"
pnpm vitest run 2>&1 | grep -E "^ +×|Test Files|Tests |Type Errors" || true
