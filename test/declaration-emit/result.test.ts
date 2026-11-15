import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

/**
 * A consumer that exports a value whose inferred type mentions `Success` must
 * be able to emit its own `.d.ts`. `Success`'s marker symbols are private to
 * `/result`; if the type is not reachable through an exported alias,
 * declaration emit fails with TS4023 or TS4058 ("has or is using name
 * '_phantom' … cannot be named"). This compiles a consumer file against the
 * source of `/result` with `declaration` on and `skipLibCheck` off and
 * expects no declaration diagnostics. Source stands in for `dist`, which has
 * the same declarations and needs no build.
 */
const here = dirname(fileURLToPath(import.meta.url))
const resultEntry = resolve(here, '../../src/result/index.js')
const consumerPath = resolve(here, 'consumer.ts')

const consumer = `
import { failure, isSuccess, success } from ${JSON.stringify(resultEntry)}
import type { Result } from ${JSON.stringify(resultEntry)}

class Invalid extends Error {
  readonly code = 'invalid' as const
}
declare const r: Result<number | undefined, Invalid>

export const one = success(1)
export const nothing = success(undefined)
export function parse(n: number) {
  return n > 0 ? success(n) : failure(new Invalid())
}
export function narrowed() {
  if (isSuccess(r)) return r
  return undefined
}
`

function declarationDiagnostics(): string[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    strict: true,
    declaration: true,
    skipLibCheck: false,
    noEmit: true,
  }
  const host = ts.createCompilerHost(options)
  const { readFile, fileExists, getSourceFile } = host
  host.fileExists = (file) => file === consumerPath || fileExists(file)
  host.readFile = (file) => (file === consumerPath ? consumer : readFile(file))
  host.getSourceFile = (file, languageVersion, ...rest) =>
    file === consumerPath
      ? ts.createSourceFile(file, consumer, languageVersion, true)
      : getSourceFile(file, languageVersion, ...rest)
  const program = ts.createProgram([consumerPath], options, host)
  const source = program.getSourceFile(consumerPath)
  return [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
    ...program.getDeclarationDiagnostics(source),
  ].map(
    (d) =>
      `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
  )
}

describe('declaration emit for a consumer', () => {
  it('can name the types success(), failure() and isSuccess() infer', () => {
    expect(declarationDiagnostics()).toEqual([])
  })
})
