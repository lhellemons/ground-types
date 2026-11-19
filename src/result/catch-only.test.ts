import { describe, expect, it } from 'vitest'
import { catchOnly, isFailure, ThrownError, tryCatch } from './index.js'
import { resultify } from '../promise/index.js'
import { resultify as callResultify } from '../call/index.js'
import { definePrimitiveValueObject } from '../value-object/index.js'
import type { Branded } from '../brand/index.js'

class A extends Error {}
class B extends A {}
class Other extends Error {}
const unexpected = [
  new TypeError(),
  new Error(),
  {},
  null,
  undefined,
  'bad',
  Symbol('bad'),
  { then() {} },
]
function throws(value: unknown): never {
  throw value
}
function expectThrow(fn: () => unknown, value: unknown) {
  let caught = false
  try {
    fn()
  } catch (error) {
    caught = true
    expect(error).toBe(value)
  }
  expect(caught).toBe(true)
}

describe('catchOnly', () => {
  it('preserves selected errors and subclasses unchanged', () => {
    for (const error of [new A(), new B(), new Other()]) {
      const result = catchOnly(A, Other)(error)
      expect(result).toBe(error)
      expect(isFailure(result)).toBe(true)
    }
  })
  it('rethrows all other values by identity', () => {
    for (const value of unexpected)
      expectThrow(() => catchOnly(A)(value), value)
  })
})

describe('catchOnly(Object) from plain JS', () => {
  const unchecked = catchOnly as (...classes: unknown[]) => unknown
  it('is refused at creation instead of turning a bug into a Failure', () => {
    expect(() => unchecked(Object)).toThrow(/catchOnly entry 0/)
    expect(() => tryCatch(() => 1, [Object] as never)).toThrow(TypeError)
  })
  it('refuses a bound subclass of a built-in that is not an Error', () => {
    class Mapish extends Map {}
    expect(() => unchecked(Mapish.bind(null))).toThrow(TypeError)
    // A bound derived class inherits its parent's `prototype`, whatever it is.
    class Plain {}
    class Sub extends Plain {}
    expect(() => unchecked(Sub.bind(null))).toThrow(TypeError)
    expect(() => unchecked(Plain.bind(null))).not.toThrow()
    for (const builtin of [Map, Array, Promise, Date, Symbol]) {
      expect(() => unchecked(builtin)).toThrow(TypeError)
    }
  })
  it('is refused for a class that is not an Error subclass, alone or in a list', () => {
    class Plain {}
    expect(() => unchecked(Plain)).toThrow(TypeError)
    expect(() => unchecked(A, Plain)).toThrow(/catchOnly entry 1/)
  })
  it('still catches Error.prototype itself and everything below it', () => {
    const handler = catchOnly(Error)
    for (const error of [new Error(), new TypeError(), new A()]) {
      expect(handler(error)).toBe(error)
    }
    const bug = new TypeError('bug')
    expectThrow(() => catchOnly(A)(bug), bug)
  })
  it('admits an entry whose own Symbol.hasInstance decides', () => {
    class Matcher {
      static [Symbol.hasInstance](value: unknown) {
        return value instanceof Error && value.message === 'match'
      }
    }
    const handler = unchecked(Matcher) as (e: unknown) => unknown
    const error = new Error('match')
    expect(handler(error)).toBe(error)
  })
})

describe('the Error prototype check does not consult Error[Symbol.hasInstance]', () => {
  const unchecked = catchOnly as (...classes: unknown[]) => unknown
  /* Runs `attempts` with `Error[Symbol.hasInstance]` redefined and reports
     whether each threw. The matchers run afterwards: they use `instanceof
     Error` themselves. */
  function throwsUnder(
    result: boolean,
    attempts: (() => unknown)[],
  ): boolean[] {
    Object.defineProperty(Error, Symbol.hasInstance, {
      value: () => result,
      configurable: true,
    })
    try {
      return attempts.map((attempt) => {
        try {
          attempt()
          return false
        } catch {
          return true
        }
      })
    } finally {
      // The property was an own addition; the inherited one comes back.
      delete (Error as unknown as Record<symbol, unknown>)[Symbol.hasInstance]
    }
  }
  it('still refuses Object and Map and accepts a plain handler when it answers true', () => {
    expect(
      throwsUnder(true, [
        () => unchecked(Object),
        () => unchecked(Map),
        () => tryCatch(() => 1, ((e: unknown) => e) as never),
      ]),
    ).toEqual([true, true, false])
  })
  it('still refuses an Error constructor as a handler and accepts a class when it answers false', () => {
    expect(
      throwsUnder(false, [
        () => tryCatch(() => 1, TypeError as never),
        () => unchecked(A),
      ]),
    ).toEqual([true, false])
  })
})

describe('catchOnly list validation', () => {
  it('throws a TypeError at creation for an empty list', () => {
    expect(() => (catchOnly as (...classes: unknown[]) => unknown)()).toThrow(
      TypeError,
    )
    expect(() => tryCatch(() => 1, [] as never)).toThrow(TypeError)
  })
  it('throws a TypeError at creation for entries unusable with instanceof', () => {
    const unusable = [
      undefined,
      null,
      {},
      'A',
      { prototype: new Error() },
      () => new A(),
      async () => new A(),
      { method(this: void) {} }.method,
      { [Symbol.hasInstance]: () => true },
      Object.assign(function () {}, { prototype: 1 }),
      Object.defineProperty(() => {}, Symbol.hasInstance, { value: 1 }),
      Object.assign(function () {}, { prototype: null }),
      // An object `prototype` without `Error.prototype` on its chain would
      // match every error (`Object`) or none (a class that is not an Error).
      Object,
      function () {},
      class Plain {},
      class extends Map {},
      Symbol,
      Object.assign(function () {}, {
        prototype: Object.create(null) as object,
      }),
      Object.assign(function () {}, { prototype: {} }),
      Object.assign(function () {}, {
        prototype: new Proxy(
          {},
          {
            getPrototypeOf(): never {
              throw new RangeError('trap')
            },
          },
        ),
      }),
    ]
    for (const entry of unusable) {
      expect(() =>
        (catchOnly as (...classes: unknown[]) => unknown)(A, entry),
      ).toThrow(TypeError)
      expect(() => tryCatch(() => 1, [entry] as never)).toThrow(TypeError)
    }
  })
  it('accepts classes, bound classes and ES5-style error constructors', () => {
    function Legacy() {}
    Legacy.prototype = Object.create(Error.prototype) as object
    function LegacyInstance() {}
    LegacyInstance.prototype = new RangeError()
    class Plain {}
    for (const entry of [
      A,
      B,
      Error,
      TypeError,
      A.bind(null),
      Legacy,
      LegacyInstance,
      // A bound function that reaches no `prototype` is admitted as native,
      // whatever it is bound to, so `Object.bind(null)` matches every Error.
      Error.bind(null),
      Object.bind(null),
      Plain.bind(null),
      Function,
    ]) {
      expect(() =>
        (catchOnly as (...classes: unknown[]) => unknown)(entry),
      ).not.toThrow()
    }
  })
})

const guardThrowing = new Proxy(
  {},
  {
    getPrototypeOf(): never {
      throw new RangeError('trap')
    },
  },
)
const unrenderable = new Proxy(
  {},
  {
    get(): never {
      throw new RangeError('trap')
    },
  },
)

describe('catchOnly entries with custom behaviour', () => {
  it('accepts a class with its own Symbol.hasInstance without calling it', () => {
    let calls = 0
    class Coded extends Error {
      static [Symbol.hasInstance](value: unknown) {
        calls++
        return value instanceof Error && value.message.startsWith('coded')
      }
    }
    const handler = catchOnly(Coded)
    expect(calls).toBe(0)
    const error = new Error('coded: x')
    expect(handler(error)).toBe(error)
    const other = new Error('plain')
    expectThrow(() => handler(other), other)
  })
  it('rejects a revoked proxy at creation', () => {
    const revocable = Proxy.revocable(class extends Error {}, {})
    revocable.revoke()
    expect(() =>
      (catchOnly as (...classes: unknown[]) => unknown)(revocable.proxy),
    ).toThrow(/catchOnly entry 0 is not an error class/)
  })
  it('rejects an entry whose Symbol.hasInstance getter throws', () => {
    class Getter extends Error {
      static get [Symbol.hasInstance](): never {
        throw new RangeError('getter')
      }
    }
    const create = () =>
      (catchOnly as (...classes: unknown[]) => unknown)(Getter)
    expect(create).toThrow(TypeError)
    expect(create).toThrow(/catchOnly entry 0 is not an error class/)
  })
  it('rejects an Error class whose Symbol.hasInstance is neither nullish nor callable', () => {
    const create = (entry: unknown) => () =>
      (catchOnly as (...classes: unknown[]) => unknown)(entry)
    const hooks: unknown[] = [1, 'hook', true, {}, [], Symbol('hook')]
    for (const hook of hooks) {
      const Broken = Object.defineProperty(
        class extends Error {},
        Symbol.hasInstance,
        { value: hook },
      )
      expect(create(Broken)).toThrow(/catchOnly entry 0 is not an error class/)
      expect(() => tryCatch(() => 1, [Broken])).toThrow(TypeError)
      // The same refusal through a getter, and through an inherited hook
      class Getter extends Error {
        static get [Symbol.hasInstance](): unknown {
          return hook
        }
      }
      expect(create(Getter)).toThrow(TypeError)
      const Parent = Object.defineProperty(
        class extends Error {},
        Symbol.hasInstance,
        { value: hook },
      )
      class Child extends Parent {}
      expect(create(Child)).toThrow(TypeError)
    }
    // The refusal is not caused by `instanceof` being unreliable at creation
    // only: the hook is what `instanceof` would reject on the error path.
    const Broken = Object.defineProperty(
      class extends Error {},
      Symbol.hasInstance,
      { value: 1 },
    )
    expect(() => new Error('x') instanceof Broken).toThrow(TypeError)
  })
  it('refuses a non-callable hook in any position of the list, without calling it', () => {
    let reads = 0
    let calls = 0
    const Broken = Object.defineProperty(
      class extends Error {},
      Symbol.hasInstance,
      {
        value: 1,
      },
    )
    const Counted = Object.defineProperty(
      class extends Error {},
      Symbol.hasInstance,
      {
        get: () => {
          reads++
          return () => {
            calls++
            return true
          }
        },
      },
    )
    expect(() =>
      (catchOnly as (...classes: unknown[]) => unknown)(Counted, Broken),
    ).toThrow(/catchOnly entry 1 is not an error class/)
    expect(() => tryCatch(() => 1, [A, Broken])).toThrow(
      /catchOnly entry 1 is not an error class/,
    )
    // The check reads the hook once and never calls it
    expect(reads).toBe(1)
    expect(calls).toBe(0)
  })
  it('accepts an Error class whose Symbol.hasInstance is null or undefined, matching as without a hook', () => {
    for (const hook of [undefined, null]) {
      const Hookless = Object.defineProperty(
        class extends Error {},
        Symbol.hasInstance,
        { value: hook },
      )
      const handler = catchOnly(Hookless)
      const error = new Hookless()
      expect(handler(error)).toBe(error)
      const other = new Error('other')
      expectThrow(() => handler(other), other)
      expect(tryCatch(() => throws(error), [Hookless])()).toBe(error)
    }
  })
  it('tests the prototype of an entry whose Symbol.hasInstance is null or undefined', () => {
    for (const hook of [undefined, null]) {
      class Plain {}
      for (const entry of [Plain, () => new A()]) {
        Object.defineProperty(entry, Symbol.hasInstance, { value: hook })
        expect(() =>
          (catchOnly as (...classes: unknown[]) => unknown)(entry),
        ).toThrow(/catchOnly entry 0 is not an error class/)
      }
    }
  })
  it('accepts a function without an object prototype that has an own or inherited hasInstance', () => {
    const bare = (): void => {}
    Object.defineProperty(bare, Symbol.hasInstance, {
      value: (value: unknown) =>
        value instanceof Error && value.message === 'bare',
    })
    const primitivePrototype = Object.assign(function () {}, { prototype: 1 })
    Object.defineProperty(primitivePrototype, Symbol.hasInstance, {
      value: (value: unknown) =>
        value instanceof Error && value.message === 'primitive',
    })
    const inheritedFrom = Object.create(Function.prototype, {
      [Symbol.hasInstance]: {
        value: (value: unknown) =>
          value instanceof Error && value.message === 'inherited',
      },
    }) as object
    const inherited = Object.setPrototypeOf(() => {}, inheritedFrom) as object
    for (const [entry, message] of [
      [bare, 'bare'],
      [primitivePrototype, 'primitive'],
      [inherited, 'inherited'],
    ] as const) {
      const handler = (
        catchOnly as (...classes: unknown[]) => (e: unknown) => unknown
      )(entry)
      const error = new Error(message)
      expect(handler(error)).toBe(error)
      const other = new Error('other')
      expectThrow(() => handler(other), other)
    }
  })
  it('accepts native functions and counts them as not matching', () => {
    for (const entry of [Math.max, parseInt]) {
      const handler = (
        catchOnly as (...classes: unknown[]) => (e: unknown) => unknown
      )(entry)
      const error = new Error('x')
      expectThrow(() => handler(error), error)
    }
  })
  it('refuses an arrow function whose own text mentions [native code]', () => {
    // Built with `Function` so the comment survives the transform.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const arrow = new Function(
      'return (e) => { return e // function () { [native code]\n}',
    )() as unknown
    expect(() =>
      (catchOnly as (...classes: unknown[]) => unknown)(arrow),
    ).toThrow(
      new TypeError(
        'catchOnly entry 0 is not an error class: it cannot be used with instanceof',
      ),
    )
  })
  it('names the failing entry in the creation error', () => {
    expect(() =>
      (catchOnly as (...classes: unknown[]) => unknown)(A, undefined),
    ).toThrow(/entry 1/)
  })
  it('rethrows the original error when an entry fails later', () => {
    function Legacy() {}
    Legacy.prototype = Object.create(Error.prototype) as object
    const handler = (
      catchOnly as (...classes: unknown[]) => (e: unknown) => unknown
    )(Legacy)
    ;(Legacy as unknown as { prototype: unknown }).prototype = 1
    const error = new Error('original')
    expectThrow(() => handler(error), error)

    class Throwing extends Error {
      static [Symbol.hasInstance](): boolean {
        throw new RangeError('hasInstance')
      }
    }
    expectThrow(() => catchOnly(Throwing)(error), error)

    const revocable = Proxy.revocable(class extends Error {}, {})
    const viaProxy = (
      catchOnly as (...classes: unknown[]) => (e: unknown) => unknown
    )(revocable.proxy)
    revocable.revoke()
    expectThrow(() => viaProxy(error), error)
  })
  it('rethrows the original when a matching hook turns the error into a non-Error', () => {
    class Hooked extends Error {
      static [Symbol.hasInstance](value: object): boolean {
        Object.setPrototypeOf(value, null)
        return true
      }
    }
    const error = new Error('hooked')
    expectThrow(() => catchOnly(Hooked)(error), error)
    expect(isFailure(error)).toBe(false)

    const other = new Error('second')
    expectThrow(() => tryCatch(() => throws(other), catchOnly(Hooked))(), other)

    // A hook that leaves the error an Error still yields a Failure.
    class Passive extends Error {
      static [Symbol.hasInstance](): boolean {
        return true
      }
    }
    const kept = new Error('kept')
    expect(catchOnly(Passive)(kept)).toBe(kept)
  })
  it('does not read Array.prototype.some while matching', () => {
    const original = Array.prototype.some
    const target = new Error('proxied')
    const replaced = new Proxy(target, {
      getPrototypeOf(t) {
        Array.prototype.some = function () {
          throw new RangeError('some replaced')
        }
        return Reflect.getPrototypeOf(t)
      },
    })
    let matched: unknown
    let rethrown: unknown
    try {
      matched = catchOnly(Error)(replaced)
      try {
        catchOnly(A, Other)(replaced)
      } catch (error) {
        rethrown = error
      }
    } finally {
      Array.prototype.some = original
    }
    expect(matched).toBe(replaced)
    expect(rethrown).toBe(replaced)
  })
  it('checks an entry once: a prototype reassigned later is matched as it then stands', () => {
    function Legacy() {}
    Legacy.prototype = Object.create(Error.prototype) as object
    const handler = (
      catchOnly as (...classes: unknown[]) => (e: unknown) => unknown
    )(Legacy)
    const bug = new TypeError('programming bug')
    expectThrow(() => handler(bug), bug)
    // Not rechecked: `Object.prototype`, which the check refuses, now makes
    // the entry match every error.
    ;(Legacy as unknown as { prototype: unknown }).prototype = Object.prototype
    expect(handler(bug)).toBe(bug)
    expect(isFailure(handler(bug) as Error)).toBe(true)
  })
  it('does not depend on the order of the entries', () => {
    class Throwing extends Error {
      static [Symbol.hasInstance](value: { code: string }): boolean {
        return value.code.startsWith('X')
      }
    }
    const error = new A()
    for (const classes of [
      [Throwing, A],
      [A, Throwing],
    ]) {
      const handler = (
        catchOnly as (...classes: unknown[]) => (e: unknown) => unknown
      )(...classes)
      expect(handler(error)).toBe(error)
    }
    const other = new Other()
    expectThrow(
      () =>
        (catchOnly as (...classes: unknown[]) => (e: unknown) => unknown)(
          Throwing,
          A,
        )(other),
      other,
    )
  })
  it('rethrows the original value when the Error guard throws', () => {
    expectThrow(() => catchOnly(A)(guardThrowing), guardThrowing)
    expectThrow(
      () => tryCatch(() => throws(guardThrowing), [A])(),
      guardThrowing,
    )
  })
})

describe('tryCatch default handler', () => {
  it('wraps a value whose Error guard throws in a ThrownError', () => {
    const result = tryCatch(() => throws(guardThrowing))()
    expect(isFailure(result)).toBe(true)
    expect(result).toBeInstanceOf(ThrownError)
    expect((result as ThrownError).thrown).toBe(guardThrowing)
  })
  it('wraps a value that cannot be rendered in a ThrownError', () => {
    const result = tryCatch(() => throws(unrenderable))()
    expect(isFailure(result)).toBe(true)
    expect(result).toBeInstanceOf(ThrownError)
    expect((result as ThrownError).thrown).toBe(unrenderable)
    expect((result as ThrownError).message).toBe('threw [object Unknown]')
  })
})

describe('tryCatch handler dispatch', () => {
  it('throws a TypeError at creation for a handler that is not a usable function or class list', () => {
    class Bare extends Error {}
    // Built with `Function` so the source text starts `class{` and
    // `class/*`, the other two characters the class check looks ahead for.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const braced = new Function('return class{}')() as unknown
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const commented = new Function('return class/*c*/Foo {}')() as unknown
    for (const handler of [
      braced,
      commented,
      class Foo extends Map {},
      Bare,
      class {},
      class Named extends Error {},
      TypeError,
      Error,
      SyntaxError,
      AggregateError,
      new Proxy(A, {}),
      new Proxy(() => {}, {
        get(): never {
          throw new RangeError('trap')
        },
      }),
      new Set([A]),
      {},
      'handler',
      1,
      null,
      undefined,
    ]) {
      expect(() => tryCatch(() => 1, handler as never)).toThrow(
        /tryCatch requires an error handler function/,
      )
    }
  })
  it('refuses an explicit undefined or null handler instead of catching everything', () => {
    const boom = () => throws('bad')
    expect(() => tryCatch(boom, undefined as never)).toThrow(TypeError)
    expect(() => tryCatch(boom, null as never)).toThrow(TypeError)
    const maybeHandler: unknown = (() => undefined)()
    expect(() => tryCatch(boom, maybeHandler as never)).toThrow(TypeError)
    // Forwarded as is, so a spread of an optional handler is refused too.
    const forwarded = [undefined] as const
    expect(() =>
      (tryCatch as (...args: unknown[]) => unknown)(boom, ...forwarded),
    ).toThrow(TypeError)
  })
  it('uses the catch-everything default only when the handler is absent', () => {
    const result = tryCatch(() => throws('bad'))()
    expect(result).toBeInstanceOf(ThrownError)
    expect((result as ThrownError).thrown).toBe('bad')
  })
  it('accepts function handlers, including methods named like a class', () => {
    const error = new A()
    const methods = {
      class(this: void, e: unknown) {
        return e as A
      },
      classify(this: void, e: unknown) {
        return e as A
      },
      async(this: void, e: unknown) {
        return e as A
      },
      class$(this: void, e: unknown) {
        return e as A
      },
      classé(this: void, e: unknown) {
        return e as A
      },
    }
    // Built with `Function` so prettier cannot remove the space in `class (e)`.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const spaced = new Function(
      'return { class (e) { return e } }.class',
    )() as (e: unknown) => A
    // The same method with a block or a line comment before its parameters.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const blockCommented = new Function(
      'return { class/*c*/(e) { return e } }.class',
    )() as (e: unknown) => A
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const lineCommented = new Function(
      'return { class//c\n(e) { return e } }.class',
    )() as (e: unknown) => A
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const separators = new Function(
      'return { class//c\u2028(e) { return e } }.class',
    )() as (e: unknown) => A
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const paragraphSeparator = new Function(
      'return { class//c\u2029(e) { return e } }.class',
    )() as (e: unknown) => A
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const carriageReturn = new Function(
      'return { class//c\r\n(e) { return e } }.class',
    )() as (e: unknown) => A
    // A lone `\r` ends a line comment too, with no `\n` after it.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const loneCarriageReturn = new Function(
      'return { class//c\r(e) { return e } }.class',
    )() as (e: unknown) => A
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const mixed = new Function(
      'return { class /* a */ // b\n /* c */ (e) { return e } }.class',
    )() as (e: unknown) => A
    const handlers = [
      (e: unknown) => e as A,
      function (e: unknown) {
        return e as A
      },
      (e: unknown) => {
        class Inner extends A {}
        return Inner.name === '' ? new Inner() : (e as A)
      },
      methods.class,
      methods.classify,
      methods.async,
      methods.class$,
      methods.classé,
      spaced,
      blockCommented,
      lineCommented,
      separators,
      paragraphSeparator,
      carriageReturn,
      loneCarriageReturn,
      mixed,
    ]
    for (const handler of handlers) {
      expect(tryCatch(() => throws(error), handler)()).toBe(error)
    }
  })
  it('still refuses a class with a comment before its name, heritage or body', () => {
    const boom = () => throws('bad')
    // A `(` inside a comment is not a parameter list. Built with `Function`
    // so the comments survive the test transform.
    const sources = [
      'class /*(*/ Named {}',
      'class /* ( */ extends Error {}',
      'class // (\n extends Error {}',
      'class /* a */ // (\n /* ( */ {}',
      'class/*c*/{}',
      // A block comment ends at the first `*/`: a later comment and its
      // `(` are the class body's, not a parameter list.
      'class /*a*/ A { x = /*b*/ (1) }',
    ]
    const classes = sources.map(
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
      (source) => new Function(`return (${source})`)() as unknown,
    )
    for (const cls of classes) {
      expect(() => tryCatch(boom, cls as never)).toThrow(TypeError)
    }
  })
  it('refuses a method named class with an HTML-like comment before its parameters', () => {
    // `<!--` and a line-start `-->`, or one after a block comment that spans
    // lines, are comments in a sloppy script, but `isClassSource` skips only
    // whitespace, block comments and line comments, so it takes the method
    // for a class. A `<!--` straight after `class` is not whitespace, `{` or
    // `/`, so that one is accepted.
    const boom = () => throws('bad')
    const sources = [
      'return { class <!-- c\n(e) { return e } }.class',
      'return { class\n--> c\n(e) { return e } }.class',
      'return { class/*c*/\n--> c\n(e) { return e } }.class',
      'return { class /*\n*/ --> c\n(e) { return e } }.class',
    ]
    for (const source of sources) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
      const method = new Function(source)() as (e: unknown) => unknown
      expect(() => tryCatch(boom, method as never)).toThrow(TypeError)
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const adjacent = new Function(
      'return { class<!-- c\n(e) { return e } }.class',
    )() as (e: unknown) => unknown
    expect(() => tryCatch(boom, adjacent as never)).not.toThrow()
  })
  /* `Array.isArray` throws for a revoked proxy before the handler check runs;
     this pins that native behaviour, not `checkedHandler`. */
  it('throws a TypeError at creation for a revoked proxy handler (via Array.isArray)', () => {
    const revocable = Proxy.revocable(() => new A(), {})
    revocable.revoke()
    expect(() => tryCatch(() => 1, revocable.proxy as never)).toThrow(TypeError)
  })
  /* A bound function has no own `prototype` and inherits its target's
     parent's, and its source text is native. So a bound Error subclass is
     refused (it inherits `Error.prototype`), while a bound `Error` and a bound
     class with no Error ancestor pass creation and run as a handler. A bound
     handler is accepted. TypeScript rejects all the bound classes. */
  it('refuses a bound Error subclass but not a bound Error or a bound base class', () => {
    const boom = () => throws('bad')
    expect(() => tryCatch(boom, A.bind(null) as never)).toThrow(TypeError)
    expect(() => tryCatch(boom, TypeError.bind(null) as never)).toThrow(
      TypeError,
    )
    class Plain {}
    expect(() => tryCatch(boom, Plain.bind(null) as never)).not.toThrow()
    expect(() => tryCatch(boom, Error.bind(null) as never)).not.toThrow()
  })
  it('throws on the error path for a bound class that is not an Error subclass', () => {
    class Plain {}
    const original = new A('original')
    let caught: unknown
    try {
      tryCatch(() => throws(original), Plain.bind(null) as never)()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TypeError)
    expect(caught).not.toBe(original)
    expect((caught as TypeError).message).toMatch(
      /cannot be invoked without 'new'/,
    )
  })
  it('replaces the error with a fresh Error for a bound Error handler', () => {
    const original = new A('original')
    const result = tryCatch(() => throws(original), Error.bind(null) as never)()
    expect(result).toBeInstanceOf(Error)
    expect(result).not.toBe(original)
  })
  it('refuses a built-in constructor, which would replace the error or return a Success', () => {
    const boom = () => throws(new RangeError('boom'))
    const constructorOf = (value: unknown) =>
      (value as { constructor: { name: string } }).constructor
    const AsyncFunction = constructorOf(Object.getPrototypeOf(async () => {}))
    const GeneratorFunction = constructorOf(
      Object.getPrototypeOf(function* () {}),
    )
    const TypedArray = Object.getPrototypeOf(Uint8Array) as { name: string }
    for (const builtin of [
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      WeakRef,
      BigInt,
      Number,
      String,
      Boolean,
      Array,
      Date,
      RegExp,
      Symbol,
      Function,
      Object,
      ArrayBuffer,
      Uint8Array,
      TypedArray,
      Intl.Collator,
      AsyncFunction,
      GeneratorFunction,
      // `URL` is refused by its class source; each Proxy has native source
      // and is refused through its target: `Map`'s own `prototype` has a
      // native `constructor`, the class's has one with class source, and the
      // generator function's has none.
      URL,
      new Proxy(Map, {}),
      new Proxy(class {}, {}),
      new Proxy(function* () {}, {}),
    ]) {
      expect(() => tryCatch(boom, builtin as never), builtin.name).toThrow(
        /tryCatch requires an error handler function/,
      )
    }
  })
  it('accepts a Proxy over a plain handler, with or without an apply trap', () => {
    const error = new A()
    const plain = function (e: unknown) {
      return e as A
    }
    const traced: string[] = []
    const handlers = [
      new Proxy(plain, {}),
      new Proxy(plain, {
        apply(target, thisArg, args) {
          traced.push('apply')
          return Reflect.apply(target, thisArg, args) as unknown
        },
      }),
      // A bound function given the `prototype` of a plain function.
      Object.assign(plain.bind(null), { prototype: plain.prototype as object }),
    ]
    for (const handler of handlers) {
      expect(tryCatch(() => throws(error), handler)()).toBe(error)
    }
    expect(traced).toEqual(['apply'])
  })
  it('refuses a Proxy over a plain function whose prototype has no ordinary own constructor', () => {
    const boom = () => throws(new RangeError('boom'))
    const make = () =>
      function (e: unknown) {
        return e as A
      }
    function Base() {}
    function Sub() {}
    Sub.prototype = Object.create(Base.prototype as object) as object
    const withPrototype = (prototype: unknown) => {
      const plain = make()
      plain.prototype = prototype as never
      return plain
    }
    const deleted = make()
    delete (deleted.prototype as { constructor?: unknown }).constructor
    const accessor = make()
    Object.defineProperty(accessor.prototype, 'constructor', {
      get: () => accessor,
    })
    const viaProxy = make()
    viaProxy.prototype = {
      constructor: new Proxy(() => {}, {}),
    } as never
    // An inherited `constructor` is not read: `Base` is an ordinary function.
    expect(Sub.prototype.constructor).toBe(Base)
    const cases = {
      'prototype replaced by {}': withPrototype({}),
      'prototype replaced by Object.create(null)': withPrototype(
        Object.create(null),
      ),
      'ES5-style subclass (inherited constructor only)': Sub,
      'constructor deleted': deleted,
      'constructor an accessor': accessor,
      'constructor a Proxy': viaProxy,
    }
    for (const [name, handler] of Object.entries(cases)) {
      expect(
        () => tryCatch(boom, new Proxy(handler, {}) as never),
        name,
      ).toThrow(/tryCatch requires an error handler function/)
    }
  })
  it('accepts a native-source function whose own prototype is null', () => {
    const error = new A()
    const nullPrototype = function (e: unknown) {
      return e as A
    }
    nullPrototype.prototype = null as never
    expect(tryCatch(() => throws(error), new Proxy(nullPrototype, {}))()).toBe(
      error,
    )
  })
  it('does not detect a built-in whose prototype.constructor was patched', () => {
    const boom = () => throws(new RangeError('boom'))
    const original = Object.getOwnPropertyDescriptor(
      Set.prototype,
      'constructor',
    )
    expect(() => tryCatch(boom, Set as never)).toThrow(
      /tryCatch requires an error handler function/,
    )
    try {
      Set.prototype.constructor = function () {}
      expect(() => tryCatch(boom, Set as never)).not.toThrow()
    } finally {
      Object.defineProperty(Set.prototype, 'constructor', original!)
    }
    expect(() => tryCatch(boom, Set as never)).toThrow(
      /tryCatch requires an error handler function/,
    )
  })
  it('does not detect Proxy, which has no own prototype', () => {
    const boom = () => throws(new RangeError('boom'))
    expect(() => tryCatch(boom, Proxy as never)).not.toThrow()
    expect(() => tryCatch(boom, Proxy as never)()).toThrow(/requires 'new'/)
  })
  it('accepts a function whose own text merely mentions [native code]', () => {
    const error = new A()
    // Built with `Function` so the comment survives the transform.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- source text under test
    const handler = new Function(
      'e',
      'return e // function () { [native code]\n',
    ) as ((e: unknown) => A) & { prototype: object }
    // Its `prototype` has no `constructor`, which only native source excuses.
    delete (handler.prototype as { constructor?: unknown }).constructor
    expect(Function.prototype.toString.call(handler)).toContain(
      'function () { [native code]\n',
    )
    expect(tryCatch(() => throws(error), handler)()).toBe(error)
  })
  it('accepts native functions with no own prototype, and bound ones', () => {
    const boom = () => throws(new RangeError('boom'))
    class Derived extends Map {}
    for (const handler of [
      // A bound derived class inherits its parent's `prototype`, not its own.
      Derived.bind(null),
      parseInt,
      Math.max,
      Array.isArray,
      String.raw,
      Map.bind(null),
      Number.bind(null),
      Object.bind(null),
    ]) {
      expect(() => tryCatch(boom, handler as never)).not.toThrow()
    }
  })
  it('does not detect a bound built-in constructor or a bound ES5-style error constructor', () => {
    const boom = () => throws(new RangeError('boom'))
    // The bound `Map` throws on the error path in place of the original error.
    expect(() => tryCatch(boom, Map.bind(null) as never)()).toThrow(
      /requires 'new'/,
    )
    // A bound `Number` returns a Success. A bound ES5-style error constructor
    // inherits `Function.prototype`, so it reaches no `prototype` either, and
    // returns `undefined` as a Success.
    expect(tryCatch(boom, Number.bind(null) as never)()).toBeNaN()
    function Legacy() {}
    Legacy.prototype = Object.create(Error.prototype) as object
    expect(tryCatch(boom, Legacy.bind(null) as never)()).toBeUndefined()
  })
  it('accepts a bound handler', () => {
    const error = new A()
    const handler = function (this: { tag: string }, e: unknown) {
      return Object.assign(e as A, { tag: this.tag })
    }.bind({ tag: 'bound' })
    expect(tryCatch(() => throws(error), handler)()).toBe(error)
    expect(error).toHaveProperty('tag', 'bound')
  })
})

describe('error classes with a private constructor', () => {
  class Priv extends Error {
    private constructor() {
      super('private')
    }
    static create(): Priv {
      return new Priv()
    }
  }
  it('are accepted by catchOnly and the tryCatch list', () => {
    const error = Priv.create()
    expect(catchOnly(Priv)(error)).toBe(error)
    expect(tryCatch(() => throws(error), [Priv])()).toBe(error)
    const other = new A()
    expectThrow(() => catchOnly(Priv)(other), other)
  })
})

describe('tryCatch shorthand', () => {
  it('catches bound constructors inside a list', () => {
    const error = new A()
    expect(tryCatch(() => throws(error), [A.bind(null)])()).toBe(error)
    expect(tryCatch(() => throws(error), [Error.bind(null)])()).toBe(error)
  })
  it('catches each unrelated class in a list', () => {
    for (const error of [new A(), new Other()]) {
      expect(tryCatch(() => throws(error), [A, Other])()).toBe(error)
    }
  })
  it('catches a subclass with a one-class list', () => {
    const error = new B()
    expect(tryCatch(() => throws(error), [A])()).toBe(error)
  })
  it('rethrows unlisted values for one-class and multi-class lists', () => {
    for (const value of unexpected) {
      expectThrow(() => tryCatch(() => throws(value), [A])(), value)
      expectThrow(() => tryCatch(() => throws(value), [A, Other])(), value)
    }
  })
})

describe('value-object catchOnly handler', () => {
  it('returns selected failures while the callable form still throws', () => {
    const error = new B()
    const factory = definePrimitiveValueObject((value: string) => {
      if (value === 'bad') throw error
      return value as Branded<string, 'Test'>
    }, catchOnly(A))
    expect(factory('ok')).toBe('ok')
    expect(factory.from('ok')).toBe('ok')
    expect(factory.from('bad')).toBe(error)
    expect(isFailure(factory.from('bad'))).toBe(true)
    expectThrow(() => factory('bad'), error)
  })
  it('rethrows unexpected values from both forms', () => {
    for (const value of unexpected) {
      const factory = definePrimitiveValueObject((_input: string) => {
        throws(value)
        return '' as Branded<string, 'Test'>
      }, catchOnly(A))
      expectThrow(() => factory.from('x'), value)
      expectThrow(() => factory('x'), value)
    }
  })
})

describe('promise resultify catchOnly handler', () => {
  it('preserves selected rejections', async () => {
    const error = new B()
    expect(await resultify(catchOnly(A), Promise.reject(error))).toBe(error)
  })
  it('propagates unlisted rejections', async () => {
    for (const value of unexpected)
      await expect(resultify(catchOnly(A), Promise.reject(value))).rejects.toBe(
        value,
      )
  })
})

describe('call resultify catchOnly handler', () => {
  it('preserves selected synchronous throws and rejections', async () => {
    const error = new B()
    expect(await callResultify(catchOnly(A), () => throws(error))()).toBe(error)
    expect(
      await callResultify(catchOnly(A), () => Promise.reject(error))(),
    ).toBe(error)
  })
  it('propagates unlisted synchronous throws and rejections', async () => {
    for (const value of unexpected) {
      await expect(
        callResultify(catchOnly(A), () => throws(value))(),
      ).rejects.toBe(value)
      await expect(
        callResultify(catchOnly(A), () => Promise.reject(value))(),
      ).rejects.toBe(value)
    }
  })
})

describe('native-source pattern boundaries', () => {
  it('refuses parentheses and braces in the apparent native name', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const entry = new Function(
      'return function f() { return 1 // function () { [native code]\n}',
    )() as never
    ;(entry as { prototype: unknown }).prototype = undefined
    expect(() => catchOnly(entry)).toThrow(
      'catchOnly entry 0 is not an error class: it cannot be used with instanceof',
    )
  })
  it('refuses trailing source after an apparent native representation', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- source text under test
    const entry = new Function(
      'return function /* () { [native code] } */ g() {}',
    )() as never
    const prototype = (entry as { prototype: unknown }).prototype
    ;(entry as { prototype: unknown }).prototype = undefined
    expect(() => catchOnly(entry)).toThrow(
      'catchOnly entry 0 is not an error class: it cannot be used with instanceof',
    )
    ;(entry as { prototype: unknown }).prototype = prototype
    delete (entry as { prototype: { constructor?: unknown } }).prototype
      .constructor
    expect(tryCatch(() => 1, entry)()).toBe(1)
  })
})
