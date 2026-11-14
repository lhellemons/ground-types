import { describe, expectTypeOf, it } from 'vitest'
import { Call } from './box.js'
import { Fn } from '../fn/box.js'
import type { NotAbortable } from './box.js'
import type { AbortableCall, AsyncCall, Call as CallIndex } from './index.js'
import type { AbortablePromise } from '../promise/index.js'
import type { Result } from '../result/index.js'

/**
 * Pins the Call Box surface declared in `./box.ts` — the two lifts and
 * their one legal order, the hard stop at the async API, the sanctioned
 * Fn crossing, and the merged name's two meanings (see
 * docs/adr/0005-box-classes.md). The assertions come from the typechecked
 * prototype on `prototype/fn-call-box-surface` (#45).
 */

interface User {
  name: string
}
declare const IdTag: unique symbol
type Id = string & { readonly [IdTag]: true }

declare const getName: (user: User) => string
declare const parseId: (s: string) => Id
declare const fetchUser: (id: Id) => Promise<User>
declare const lookup: (id: Id) => User
declare const mayBeSync: CallIndex<User, Id>
declare const fail: (reason: unknown) => Result<User, TypeError>

describe('the lifts, in their one legal order', () => {
  it('lift to a Result first, then wrap for a handle', () => {
    expectTypeOf(
      Call.from(fetchUser)
        .resultify(fail)
        .abortable()
        .invoke('x' as Id),
    ).toEqualTypeOf<AbortablePromise<Result<User, TypeError>>>()
  })

  it('abortable alone', () => {
    expectTypeOf(
      Call.from(fetchUser)
        .abortable()
        .invoke('x' as Id),
    ).toEqualTypeOf<AbortablePromise<User>>()
  })

  it('resultify alone — an AsyncCall, plain promise, no handle', () => {
    expectTypeOf(
      Call.from(fetchUser)
        .resultify(fail)
        .invoke('x' as Id),
    ).toEqualTypeOf<Promise<Result<User, TypeError>>>()
  })

  it('a synchronous Call is boxed and lifted just the same', () => {
    expectTypeOf(
      Call.from(lookup)
        .resultify(fail)
        .invoke('x' as Id),
    ).toEqualTypeOf<Promise<Result<User, TypeError>>>()
  })

  it('the canonical free-to-settle-either-way Call collapses to its output', () => {
    expectTypeOf(
      Call.from(mayBeSync)
        .resultify(fail)
        .invoke('x' as Id),
    ).toEqualTypeOf<Promise<Result<User, TypeError>>>()
  })
})

describe('terminals and the hard stop', () => {
  it('.call hands the lifted Call back — the Box layer stops at Call', () => {
    expectTypeOf(
      Call.from(fetchUser).resultify(fail).abortable().call,
    ).toEqualTypeOf<AbortableCall<Result<User, TypeError>, Id>>()
  })

  it('unbox() and the fold overload', () => {
    expectTypeOf(Call.from(lookup).unbox()).toEqualTypeOf<(id: Id) => User>()
    expectTypeOf(
      Call.from(lookup).unbox((c) => c.length),
    ).toEqualTypeOf<number>()
  })
})

describe('the Fn overlap, sanctioned as the crossing', () => {
  it('every Call is a function: adapt the input as an Fn, re-enter as a Call', () => {
    const adapted = Fn.from(lookup).compose(parseId).fn
    expectTypeOf(Call.from(adapted).resultify(fail).invoke('x')).toEqualTypeOf<
      Promise<Result<User, TypeError>>
    >()
  })

  it('and every Mapper is a Call', () => {
    expectTypeOf(
      Call.from(getName).invoke({ name: 'a' }),
    ).toEqualTypeOf<string>()
  })
})

describe('what must not compile', () => {
  it("the abort-discarding order is closed, by NotAbortable's message", () => {
    // @ts-expect-error — resultify would discard the abort handle
    Call.from(fetchUser).abortable().resultify(fail)
  })

  it('the private constructor closes direct construction', () => {
    // @ts-expect-error — instances come only from the static factory
    void new Call()
  })

  it('unbox(undefined) is an argument, not a zero-arg call (ADR 0003)', () => {
    // @ts-expect-error — undefined is not a folding callback
    Call.from(lookup).unbox(undefined)
  })

  it('the transience rule is checker-enforced: a Box cannot travel through the type', () => {
    // @ts-expect-error — unbox first; the boxed form has no spellable type
    const stored: Call<User, Id> = Call.from(lookup)
    void stored
  })
})

describe('the worded gate, pinned by message string', () => {
  it('NotAbortable passes a plain Call through', () => {
    expectTypeOf<NotAbortable<typeof fetchUser>>().toEqualTypeOf<unknown>()
  })

  it('NotAbortable is the worded rejection for an already-abortable Call', () => {
    const abortableFetch = Call.from(fetchUser).abortable().call
    void abortableFetch
    expectTypeOf<
      NotAbortable<typeof abortableFetch>
    >().toEqualTypeOf<'This Call is already abortable — resultify would discard the abort handle; invoke it and lift its promise with promise/resultify instead'>()
  })
})

describe('the merged name', () => {
  it('the type meaning is the module type, defaults included', () => {
    expectTypeOf<Call<User, Id>>().toEqualTypeOf<CallIndex<User, Id>>()
    expectTypeOf<Call>().toEqualTypeOf<CallIndex>()
  })

  it('an AsyncCall annotation still comes from /call, one home per name', () => {
    const lifted: AsyncCall<Result<User, TypeError>, Id> = Call.from(
      lookup,
    ).resultify(fail).call
    expectTypeOf(lifted).toEqualTypeOf<AsyncCall<Result<User, TypeError>, Id>>()
  })
})
