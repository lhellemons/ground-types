#!/usr/bin/env bash
# PROTOTYPE #101 — measure the `stack?: never` marker in a temporary git
# worktree of HEAD: apply an arm's patch, drop probe.ts into src/result,
# typecheck with declaration emit on, and report which probe cases raise a
# diagnostic and which suite files break.
#   prototypes/101/run.sh <main|a|b|b2> [path to a tsc binary] [--suite]
# The default tsc is the project's; pass another (5.4, 7.0) installed
# anywhere. --suite also runs vitest (the project's TypeScript only), which
# covers the type tests, the Box pins and the consumer declaration-emit test.
set -euo pipefail
ARM=${1:?arm: main, a, b or b2}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TSC=$ROOT/node_modules/.bin/tsc; SUITE=
for x in "${@:2}"; do
  if [ "$x" = --suite ]; then SUITE=--suite; else TSC=$x; fi
done
TSC_PATH=$(command -v "$TSC") || { echo "cannot find tsc: $TSC" >&2; exit 2; }
case "$TSC_PATH" in /*) TSC=$TSC_PATH ;; *) TSC="$PWD/$TSC_PATH" ;; esac
"$TSC" -v >/dev/null 2>&1 || { echo "cannot run tsc: $TSC" >&2; exit 2; }
case "$ARM" in main | a | b | b2) ;; *) echo "unknown arm: $ARM" >&2; exit 2 ;; esac
WT=$(mktemp -d "${TMPDIR:-/tmp}/proto101.XXXXXX")
cleanup() {
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  rm -rf "$WT"
}
trap cleanup EXIT
git -C "$ROOT" worktree add --detach "$WT" HEAD >/dev/null 2>&1
cd "$WT"
[ "$ARM" != main ] && git apply "prototypes/101/arm-$ARM.patch"
ln -s "$ROOT/node_modules" node_modules
cp prototypes/101/probe.ts src/result/proto101.ts
# Declaration emit on, so a marker that cannot be named shows as TS4xxx.
# TypeScript 5.4 reports the tsconfig's noUncheckedSideEffectImports (5.6+)
# as TS5023 and checks on; run.sh drops that one diagnostic from the count,
# and stops on any other diagnostic without a location (a configuration
# error means nothing was measured).
cat >tsconfig.proto.json <<'JSON'
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "emitDeclarationOnly": true, "outDir": "proto-out", "declarationMap": false } }
JSON
OUT=$("$TSC" -p tsconfig.proto.json --pretty false 2>&1 || true)
echo "== arm $ARM, typescript $("$TSC" -v)"
node -e '
const fs=require("fs");const out=process.argv[1];
const lines=fs.readFileSync("src/result/proto101.ts","utf8").split("\n");
const hit=new Map();const other=[];
const known=(code,msg)=>code==="TS5023"&&msg.includes("noUncheckedSideEffectImports");
for(const m of out.matchAll(/^error (TS\d+): (.*)$/gm))
  if(!known(m[1],m[2])){console.error(`configuration error, no measurement: ${m[1]}: ${m[2]}`);process.exit(2)}
for(const m of out.matchAll(/^(\S+?)\((\d+),\d+\): error (TS\d+): (.*)$/gm)){
  if(m[1].endsWith("proto101.ts")){const l=+m[2];hit.set(l,(hit.get(l)||[]).concat(m[3]))}
  else if(!known(m[3],m[4]))other.push(`${m[1]}:${m[2]} ${m[3]}`)}
lines.forEach((t,i)=>{const c=t.match(/CASE: (.*)$/);if(!c)return;
  const h=hit.get(i+1);console.log(`${h?"ERROR":"ok   "}  ${c[1]}${h?"  ["+[...new Set(h)].join(",")+"]":""}`)});
console.log(`-- diagnostics outside the probe: ${other.length}`);other.forEach(o=>console.log("   "+o));' "$OUT"
if [ "$SUITE" = --suite ]; then
  rm src/result/proto101.ts
  SUMMARY=$(node_modules/.bin/vitest run --no-cache 2>&1 | grep -E "^ +(×|FAIL)|Test Files|Tests |Type Errors" || true)
  if [ -z "$SUMMARY" ]; then
    echo "suite: no vitest summary (did vitest run?)" >&2
  else
    echo "$SUMMARY"
  fi
fi
