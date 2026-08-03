#!/usr/bin/env node
// Enforces docs/adr/0001-unboxed-maybe-and-result.md: dist/maybe/index.js and
// dist/result/index.js must never import each other at runtime. The two
// source modules only ever exchange `import type`, which `verbatimModuleSyntax`
// erases entirely at emit — a regression here means something started
// importing a VALUE (e.g. `isFailure`/`isNothing`) across the boundary.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const adr = 'docs/adr/0001-unboxed-maybe-and-result.md'
const { name: packageName } = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8'),
)

const modules = [
  {
    name: 'maybe',
    path: resolve(rootDir, 'dist/maybe/index.js'),
    forbiddenPath: resolve(rootDir, 'dist/result/index.js'),
    forbiddenBareSpecifier: `${packageName}/result`,
  },
  {
    name: 'result',
    path: resolve(rootDir, 'dist/result/index.js'),
    forbiddenPath: resolve(rootDir, 'dist/maybe/index.js'),
    forbiddenBareSpecifier: `${packageName}/maybe`,
  },
]

/** Collects every module specifier a file imports from, statically or dynamically. */
function collectImportSpecifiers(filePath) {
  const source = readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    ts.ScriptKind.JS,
  )

  const specifiers = []

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

execFileSync('pnpm', ['build'], { cwd: rootDir, stdio: 'inherit' })

const violations = []

for (const module of modules) {
  const specifiers = collectImportSpecifiers(module.path)
  for (const specifier of specifiers) {
    const resolvedAsRelative = resolve(dirname(module.path), specifier)
    const isForbidden =
      resolvedAsRelative === module.forbiddenPath ||
      specifier === module.forbiddenBareSpecifier
    if (isForbidden) {
      violations.push(
        `dist/${module.name}/index.js imports ${JSON.stringify(specifier)}, a runtime import of the other module.`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(
    `assert-no-runtime-cycle: dist/maybe and dist/result must not import each other at runtime (${adr}).\n`,
  )
  for (const violation of violations) {
    console.error(`  - ${violation}`)
  }
  console.error(
    '\nUse an `import type` (erased by verbatimModuleSyntax) instead of importing a value ' +
      '(e.g. `isFailure`/`isNothing`) across the maybe/result boundary.',
  )
  process.exit(1)
}

console.log(
  'assert-no-runtime-cycle: dist/maybe/index.js and dist/result/index.js stay free of runtime imports of each other.',
)
