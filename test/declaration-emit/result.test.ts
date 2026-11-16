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
 * source of `/result`, standing in for `dist`, with `declaration` on and
 * `skipLibCheck` off and expects no declaration diagnostics.
 */
const here = dirname(fileURLToPath(import.meta.url))
const resultEntry = resolve(here, '../../src/result/index.js')
const consumerPath = resolve(here, 'consumer.ts')

const consumer = `
import {
  andThen,
  attempt,
  collect,
  failure,
  isSuccess,
  map,
  success,
} from ${JSON.stringify(resultEntry)}
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

class InvalidId extends Error {
  readonly kind = 'InvalidId' as const
}
class InvalidCount extends Error {
  readonly kind = 'InvalidCount' as const
}
declare function id(raw: string): Result<string, InvalidId>
declare function countOf(raw: number): Result<number, InvalidCount>
class Door {
  constructor(
    readonly id: string,
    readonly count: number,
  ) {}
}

export function annotated(raw: string): Result<Door, InvalidId | InvalidCount> {
  return map(
    ({ id, count }: { id: string; count: number }) => new Door(id, count),
    collect({ id: id(raw), count: countOf(1) }),
  )
}
export function collectedUnannotated(raw: string) {
  return map(
    ({ id, count }: { id: string; count: number }) => new Door(id, count),
    collect({ id: id(raw), count: countOf(1) }),
  )
}
export function collectedAndThen(raw: string) {
  return andThen(
    ({ id }: { id: string }) => success(new Door(id, 0)),
    collect({ id: id(raw) }),
  )
}
export function collectedParts(raw: string) {
  return collect({ id: id(raw), count: countOf(1) })
}
export function collectedTuple(raw: string) {
  return collect([id(raw), countOf(1)])
}
export function collectedList(raws: string[]) {
  return collect(raws.map(id))
}
export function collectedBuild(raw: string) {
  return collect(
    { id: id(raw), count: countOf(1) },
    ({ id, count }) => new Door(id, count),
  )
}
export function collectedBuildAnnotated(
  raw: string,
): Result<Door, InvalidId | InvalidCount> {
  return collect(
    { id: id(raw), count: countOf(1) },
    ({ id, count }) => new Door(id, count),
  )
}
export const attempted = (raw: string) =>
  attempt((take) => new Door(take(id(raw)), take(countOf(1))))
export function wrapped<P extends Record<string, unknown>>(
  parts: P & Record<symbol, never>,
) {
  return collect(parts)
}
export function attemptedAnnotated(
  raw: string,
): Result<Door, InvalidId | InvalidCount> {
  return attempt((take) => new Door(take(id(raw)), take(countOf(1))))
}
`

function compile(emit: boolean): {
  diagnostics: string[]
  declarations: string
} {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    strict: true,
    declaration: true,
    skipLibCheck: false,
    noEmit: !emit,
    emitDeclarationOnly: emit,
  }
  const host = ts.createCompilerHost(options)
  const { readFile, fileExists, getSourceFile } = host
  host.fileExists = (file) => file === consumerPath || fileExists(file)
  host.readFile = (file) => (file === consumerPath ? consumer : readFile(file))
  host.getSourceFile = (file, languageVersion, ...rest) =>
    file === consumerPath
      ? ts.createSourceFile(file, consumer, languageVersion, true)
      : getSourceFile(file, languageVersion, ...rest)
  let declarations = ''
  host.writeFile = (file, text) => {
    if (file.endsWith('consumer.d.ts')) declarations = text
  }
  const program = ts.createProgram([consumerPath], options, host)
  const source = program.getSourceFile(consumerPath)
  if (emit) program.emit(source, undefined, undefined, true)
  const diagnostics = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
    ...program.getDeclarationDiagnostics(source),
  ].map(
    (d) =>
      `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
  )
  return { diagnostics, declarations }
}

describe('declaration emit for a consumer', () => {
  it('can name the types success(), failure(), isSuccess(), collect() and attempt() infer', () => {
    expect(compile(false).diagnostics).toEqual([])
  })

  it('writes the exported Failed, not the module-private ErrorOf, for a generic collect', () => {
    const { diagnostics, declarations } = compile(true)
    expect(diagnostics).toEqual([])
    expect(declarations).toContain('export declare function wrapped')
    expect(declarations).toMatch(/\.Failed</)
    expect(declarations).not.toContain('internal')
  })
})
