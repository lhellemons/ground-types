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
    for (const entry of [
      A,
      B,
      Error,
      TypeError,
      A.bind(null),
      Legacy,
      LegacyInstance,
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
    ]
    for (const handler of handlers) {
      expect(tryCatch(() => throws(error), handler)()).toBe(error)
    }
  })
  /* `Array.isArray` throws for a revoked proxy before the handler check runs;
     this pins that native behaviour, not `checkedHandler`. */
  it('throws a TypeError at creation for a revoked proxy handler (via Array.isArray)', () => {
    const revocable = Proxy.revocable(() => new A(), {})
    revocable.revoke()
    expect(() => tryCatch(() => 1, revocable.proxy as never)).toThrow(TypeError)
  })
  /* A bound function hides its target, so only what the bound function itself
     reveals is checked: a bound Error subclass is refused, while a bound
     `Error` or a bound class that is not an Error subclass passes creation
     and runs as a handler. A bound handler is accepted. TypeScript rejects
     all three bound classes. */
  it('refuses a bound Error subclass but not a bound base class', () => {
    const boom = () => throws('bad')
    expect(() => tryCatch(boom, A.bind(null) as never)).toThrow(TypeError)
    expect(() => tryCatch(boom, TypeError.bind(null) as never)).toThrow(
      TypeError,
    )
    class Plain {}
    expect(() => tryCatch(boom, Plain.bind(null) as never)).not.toThrow()
    expect(() => tryCatch(boom, Error.bind(null) as never)).not.toThrow()
  })
  it('replaces the error with a fresh Error for a bound Error handler', () => {
    const original = new A('original')
    const result = tryCatch(() => throws(original), Error.bind(null) as never)()
    expect(result).toBeInstanceOf(Error)
    expect(result).not.toBe(original)
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
