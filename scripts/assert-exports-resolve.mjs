#!/usr/bin/env node
// Checks that package.json's `exports` map describes the package that was
// actually built. `pnpm build` proves the TypeScript compiles; it says nothing
// about whether the subpaths consumers import point at files that exist, so a
// typo in a subpath — or a module added to src and never exported — ships with
// CI green and breaks at the consumer's import statement.
//
// Two directions are checked, because each catches a different mistake:
//   - every declared subpath resolves, and its JS entry really imports;
//   - every built module is reachable through some subpath.
//
// The second direction is only meaningful against a build with nothing stale
// in it, which is why `pnpm build` clears dist first: `tsc` never removes its
// own output, so a renamed module would otherwise be reported as one the
// exports map forgot, long after it stopped existing.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const { exports: exportsMap } = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8'),
)

execFileSync('pnpm', ['build'], { cwd: rootDir, stdio: 'inherit' })

const problems = []
const declaredTargets = new Set()

for (const [subpath, target] of Object.entries(exportsMap)) {
  // `"./package.json": "./package.json"` is a bare string rather than a
  // conditions object, and is not a built entry point.
  if (typeof target === 'string') {
    if (!existsSync(resolve(rootDir, target))) {
      problems.push(`"${subpath}" points at ${target}, which does not exist.`)
    }
    continue
  }

  for (const [condition, file] of Object.entries(target)) {
    if (!existsSync(resolve(rootDir, file))) {
      problems.push(
        `"${subpath}" declares ${condition}: ${file}, which does not exist.`,
      )
      continue
    }
    if (condition === 'default') {
      declaredTargets.add(file)
      try {
        // Importing is the part `existsSync` cannot do: it proves the emitted
        // module's own relative specifiers resolve, which is where an extension
        // or a renamed file goes wrong.
        await import(pathToFileURL(resolve(rootDir, file)).href)
      } catch (error) {
        problems.push(`"${subpath}" fails to import: ${error.message}`)
      }
    }
  }
}

for (const entry of readdirSync(resolve(rootDir, 'dist'), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) {
    continue
  }
  const indexFile = `./dist/${entry.name}/index.js`
  if (
    existsSync(resolve(rootDir, indexFile)) &&
    !declaredTargets.has(indexFile)
  ) {
    problems.push(
      `dist/${entry.name} was built but no subpath exports it — consumers cannot reach it.`,
    )
  }
}

if (problems.length > 0) {
  console.error(
    "assert-exports-resolve: package.json's exports do not match the build.\n",
  )
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

console.log(
  `assert-exports-resolve: all ${Object.keys(exportsMap).length} declared subpaths resolve and import, and every built module is exported.`,
)
