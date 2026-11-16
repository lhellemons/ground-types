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
 *
 * An object spread of a `Success` or a `Failure` is the open case: the
 * spread copies the marker properties into a fresh object type, whose symbol
 * keys cannot be named. `spreadCases` pins it, so that a later fix flips it.
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
  isFailure,
  isSuccess,
  map,
  success,
} from ${JSON.stringify(resultEntry)}
import type { Result } from ${JSON.stringify(resultEntry)}

class Invalid extends Error {
  readonly code = 'invalid' as const
}
class Other extends Error {
  readonly other = 1 as const
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

declare const mixed: Result<number | string, Invalid>
declare const shapes: Result<{ id: string } | { name: string }, Invalid>

export function narrowedByTypeof() {
  if (isSuccess(mixed) && typeof mixed === 'number') return mixed
  return undefined
}
export function narrowedByIn() {
  if (isSuccess(shapes) && 'id' in shapes) return shapes
  return undefined
}
declare const failed: Result<number | string, Invalid | Other>
export function failureNarrowedByInstanceof() {
  if (isFailure(failed) && failed instanceof Invalid) return failed
  return undefined
}
export function failureNarrowedByIn() {
  if (isFailure(failed) && 'code' in failed) return failed
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
export function parseAll<T>(
  raws: string[],
  parse: (raw: string) => Result<T, InvalidId>,
) {
  return collect(raws.map(parse))
}
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

const header = `
import { failure, isSuccess, success } from ${JSON.stringify(resultEntry)}
import type { Result } from ${JSON.stringify(resultEntry)}
class Invalid extends Error {
  readonly code = 'invalid' as const
}
declare const record: Result<{ id: string }, Invalid>
`
const spreadCases = {
  'a Success spread into an object': {
    code: `export const spreadSuccess = { ...success({ id: 'x' }) }`,
    typed: `export const spreadSuccess: { id: string } = { ...success({ id: 'x' }) }`,
  },
  'a narrowed Success spread with an extra member': {
    code: `export function spreadNarrowed() {
  if (isSuccess(record)) return { ...record, extra: 1 }
  return undefined
}`,
    typed: `export function spreadNarrowed(): { id: string; extra: number } | undefined {
  if (isSuccess(record)) return { ...record, extra: 1 }
  return undefined
}`,
  },
  'a Failure spread into an object': {
    code: `export const spreadFailure = { ...failure(new Invalid()) }`,
    typed: `export const spreadFailure: { readonly code: 'invalid' } = { ...failure(new Invalid()) }`,
  },
  'a narrowed Success read with object rest': {
    code: `export function rest() {
  if (isSuccess(record)) {
    const { id, ...others } = record
    return { id, others }
  }
  return undefined
}`,
    typed: `export function rest(): { id: string; others: object } | undefined {
  if (isSuccess(record)) {
    const { id, ...others } = record
    return { id, others }
  }
  return undefined
}`,
  },
}

function compile(
  emit: boolean,
  text = consumer,
): {
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
  host.readFile = (file) => (file === consumerPath ? text : readFile(file))
  host.getSourceFile = (file, languageVersion, ...rest) =>
    file === consumerPath
      ? ts.createSourceFile(file, text, languageVersion, true)
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
  it('writes a narrowed Success as SuccessMarkers, and a narrowed Failure as FailureMarkers', () => {
    const { diagnostics, declarations } = compile(true)
    expect(diagnostics).toEqual([])
    const declared = (name: string) => {
      const start = declarations.indexOf(`export declare function ${name}(`)
      expect(start).toBeGreaterThanOrEqual(0)
      const next = declarations.slice(start).search(/\n(export )?declare /)
      return declarations.slice(start, next === -1 ? undefined : start + next)
    }
    expect(declared('narrowedByTypeof')).toMatch(
      /number & import\(.*\)\.SuccessMarkers</,
    )
    expect(declared('narrowedByIn')).toMatch(/\.SuccessMarkers</)
    expect(declared('failureNarrowedByInstanceof')).toMatch(/\.FailureMarkers</)
    expect(declarations).not.toContain('_phantom')
  })

  describe.each(Object.entries(spreadCases))('%s', (_name, { code, typed }) => {
    it('still fails with TS4023 or TS4058, naming a marker symbol: the spread copies marker properties whose symbol keys cannot be named', () => {
      const { diagnostics } = compile(true, header + code)
      expect(diagnostics.length).toBeGreaterThan(0)
      for (const diagnostic of diagnostics)
        expect(diagnostic).toMatch(
          /^TS40(23|58): .*name '_(phantom|value|error)' from .*cannot be named/,
        )
    })

    it('emits with an explicit type on the exported value', () => {
      expect(compile(true, header + typed).diagnostics).toEqual([])
    })
  })

  it('can name the types success(), failure(), isSuccess(), collect() and attempt() infer', () => {
    expect(compile(false).diagnostics).toEqual([])
  })

  it('writes the exported Failed, not the module-private ErrorOf, for a generic collect', () => {
    const { diagnostics, declarations } = compile(true)
    expect(diagnostics).toEqual([])
    expect(declarations).toContain('export declare function wrapped')
    expect(declarations).toMatch(/\.Failed</)
    expect(declarations).not.toContain('ErrorOf')
    // Every declaration but `parseAll`'s is free of the module-private path.
    const lines = declarations.split('\n')
    const parseAll = lines.filter((line) =>
      line.includes('export declare function parseAll'),
    )
    expect(parseAll).toHaveLength(1)
    expect(
      lines
        .filter((line) => !line.includes('export declare function parseAll'))
        .join('\n'),
    ).not.toContain('result/internal')
    // The known exception (#120 item 12): a generic list names `ValueOf`.
    expect(parseAll[0]).toContain('internal.js").ValueOf<')
    expect(parseAll[0]).toContain('.Failed<')
  })
})
