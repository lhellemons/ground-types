import { describe, expectTypeOf, it } from 'vitest'
import { Fn } from './box.js'
import { Fn as RootFn } from '../index.js'
import type { NotAsync, UnaryInput } from './box.js'
import type { Fn as FnIndex, Mapper } from './index.js'
import type { Result } from '../result/index.js'

/**
 * Pins the Fn Box surface declared in `./box.ts` — any-arity subjects, the
 * two chaining directions and their gate, the tryCatch lift, the negative
 * cases the gates exist for, and the merged name's two meanings (see
 * docs/adr/0005-box-classes.md). The assertions come from the typechecked
 * prototypes on `prototype/fn-call-box-surface` (#45) and
 * `prototype/result-box-surface` (#44, the tryCatch addendum).
 */

interface User {
  name: string
}
declare const IdTag: unique symbol
type Id = string & { readonly [IdTag]: true }

declare const getName: (user: User) => string
declare const upper: (s: string) => string
declare const findUser: (id: Id) => User
declare const parseId: (s: string) => Id
declare const add: (a: number, b: number) => number
declare const parseCount: (s: string) => number
declare const fetchCount: (s: string) => Promise<number>

declare class HandledError extends Error {
  readonly kind: 'handled'
}

describe('pipe: appends left to right, any arity', () => {
  it('the headline chain', () => {
    expectTypeOf(
      Fn.from(getName).pipe(upper).apply({ name: 'a' }),
    ).toEqualTypeOf<string>()
  })

  it('an n-ary subject survives pipe — only the return is transformed', () => {
    expectTypeOf(Fn.from(add).pipe(String).apply(1, 2)).toEqualTypeOf<string>()
  })

  it('multi-step pipe reads in data order', () => {
    expectTypeOf(
      Fn.from(findUser)
        .pipe(getName, upper)
        .apply('x' as Id),
    ).toEqualTypeOf<string>()
  })

  it('the ladder is typed to ten steps, like fn/pipe', () => {
    expectTypeOf(
      Fn.from(upper)
        .pipe(
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
        )
        .apply('x'),
    ).toEqualTypeOf<string>()
  })
})

describe('compose: prepends right to left, unary subjects only', () => {
  it('the prepended step runs first', () => {
    expectTypeOf(
      Fn.from(getName)
        .compose(findUser)
        .apply('x' as Id),
    ).toEqualTypeOf<string>()
  })

  it("n-ary compose keeps compose's direction — the last step runs first", () => {
    expectTypeOf(
      Fn.from(getName).compose(findUser, parseId).apply('x'),
    ).toEqualTypeOf<string>()
  })

  it('a chain may mix directions — the accepted cost of keeping both verbs', () => {
    expectTypeOf(
      Fn.from(getName)
        .compose(findUser)
        .pipe(upper)
        .apply('x' as Id),
    ).toEqualTypeOf<string>()
  })

  it('.fn hands back the reusable Mapper compose would have built', () => {
    expectTypeOf(Fn.from(getName).compose(findUser).fn).toEqualTypeOf<
      Mapper<Id, string>
    >()
  })

  it('the ladder is typed to ten steps, like fn/compose', () => {
    expectTypeOf(
      Fn.from(upper)
        .compose(
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
          upper,
        )
        .apply('x'),
    ).toEqualTypeOf<string>()
  })
})

describe('the clause-1 statics', () => {
  it('identity is a way in — the one static whose arity diverges from its free function', () => {
    expectTypeOf(Fn.identity<User>().apply({ name: 'a' })).toEqualTypeOf<User>()
  })

  it('constant boxes an argument-ignoring function', () => {
    expectTypeOf(Fn.constant(0).apply()).toEqualTypeOf<number>()
  })
})

describe('tryCatch: the synchronous lift, as a chaining member (#44)', () => {
  it('the zero-arg lift pins E = Error, like the handler-less functional form', () => {
    const lifted = Fn.from(parseCount).tryCatch()
    expectTypeOf(lifted.unbox()).toEqualTypeOf<
      (s: string) => Result<number, Error>
    >()
    expectTypeOf(lifted.apply('7')).toEqualTypeOf<Result<number, Error>>()
  })

  it("a handler translates — E is the handler's, and it may recover", () => {
    const handled = Fn.from(parseCount).tryCatch(() => new HandledError())
    expectTypeOf(handled.apply('7')).toEqualTypeOf<
      Result<number, HandledError>
    >()
  })

  it('the lift chains — it is a clause-2 member, not a terminal', () => {
    expectTypeOf(
      Fn.from(parseCount)
        .pipe((n) => n + 1)
        .tryCatch()
        .apply('7'),
    ).toEqualTypeOf<Result<number, Error>>()
  })
})

describe('terminals', () => {
  it('unbox() and the fold overload', () => {
    expectTypeOf(Fn.from(getName).unbox()).toEqualTypeOf<
      (user: User) => string
    >()
    expectTypeOf(
      Fn.from(getName).unbox((f) => f.length),
    ).toEqualTypeOf<number>()
  })
})

describe('what must not compile', () => {
  it("compose rejects an n-ary subject, by UnaryInput's message", () => {
    // @ts-expect-error — prepending replaces the whole parameter list
    Fn.from(add).compose(parseId)
  })

  it("apply is pinned to the subject's parameter list", () => {
    // @ts-expect-error — add takes two arguments
    Fn.from(add).apply(1)
  })

  it("pipe's step must fit the subject's return type", () => {
    // @ts-expect-error — findUser takes an Id, not getName's string
    Fn.from(getName).pipe(findUser)
  })

  it("compose's step must produce the subject's input", () => {
    // @ts-expect-error — upper produces a string, not getName's User
    Fn.from(getName).compose(upper)
  })

  it('an async subject cannot be tryCatch-ed — NotAsync gates the lift', () => {
    // @ts-expect-error — use Call's resultify: the asynchronous twin
    Fn.from(fetchCount).tryCatch()
  })

  it('the private constructor closes direct construction', () => {
    // @ts-expect-error — instances come only from the static factories
    void new Fn()
  })

  it('unbox(undefined) is an argument, not a zero-arg call (ADR 0003)', () => {
    // @ts-expect-error — undefined is not a folding callback
    Fn.from(getName).unbox(undefined)
  })
})

describe('the worded gates, pinned by message string', () => {
  it('UnaryInput resolves to the input type for a unary subject', () => {
    expectTypeOf<UnaryInput<typeof upper>>().toEqualTypeOf<string>()
  })

  it('UnaryInput is the worded rejection for an n-ary subject', () => {
    expectTypeOf<
      UnaryInput<typeof add>
    >().toEqualTypeOf<'compose prepends a step, replacing the whole parameter list — this function takes more than one argument; use .pipe to transform its return instead'>()
  })

  it('NotAsync passes a synchronous subject through', () => {
    expectTypeOf<NotAsync<typeof parseCount>>().toEqualTypeOf<unknown>()
  })

  it('NotAsync is the worded rejection for an async subject', () => {
    expectTypeOf<
      NotAsync<typeof fetchCount>
    >().toEqualTypeOf<'This function returns a Promise (or thenable) — tryCatch is the synchronous lift; use call/resultify or promise/resultify instead'>()
  })
})

describe('the merged name and the root re-export', () => {
  it('the type meaning is the module type — decision 5 degrades usefully here', () => {
    // `Fn` as an annotation is NOT an error: it resolves to the function
    // type from /fn, which is the type you wanted.
    const asType: Fn<string, [number]> = (n: number) => String(n)
    expectTypeOf(asType).toEqualTypeOf<FnIndex<string, [number]>>()
  })

  it('the alias restates the defaults: bare Fn resolves', () => {
    expectTypeOf<Fn>().toEqualTypeOf<FnIndex>()
  })

  it('the root re-export carries both meanings', () => {
    expectTypeOf(RootFn).toEqualTypeOf<typeof Fn>()
    expectTypeOf<RootFn<string, [number]>>().toEqualTypeOf<
      FnIndex<string, [number]>
    >()
  })
})
