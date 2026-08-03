#!/usr/bin/env node
// Removes the build output before a build writes it again.
//
// `tsc` only ever adds to its outDir, so a module that was renamed or dropped
// leaves its old `dist/` directory behind forever. That is not just clutter:
// `assert-exports-resolve` checks that every built module is reachable through
// a subpath, so a stale directory is reported as one the exports map forgot —
// a failure describing a module that no longer exists, on a working tree that
// is perfectly fine. CI never saw it, because CI always starts from an empty
// checkout; only the machine that did the rename saw it, which is the machine
// least able to make sense of it.
import { rmSync } from 'node:fs'

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })
