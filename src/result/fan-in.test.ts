import { describe, expect, it } from 'vitest'
import {
  ThrownError,
  attempt,
  catchOnly,
  collect,
  failure,
  isFailure,
  isSuccess,
  success,
  tryCatch,
} from './index.js'
import type { Result, Take } from './index.js'
import { map as mapMaybe } from '../maybe/index.js'

class InvalidId extends Error {
  readonly kind = 'InvalidId' as const
}
class InvalidCount extends Error {
  readonly kind = 'InvalidCount' as const
}

const id = (raw: string): Result<string, InvalidId> =>
  raw === 'BAD' ? failure(new InvalidId('bad id')) : success(raw)
const count = (raw: number): Result<number, InvalidCount> =>
  raw < 0 ? failure(new InvalidCount('bad count')) : success(raw)

/** Runs `fn` and hands back what it threw, or fails the test if it did not. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn()
  } catch (thrown) {
    return thrown
  }
  throw new Error('expected a throw')
}

describe('collect', () => {
  it('returns its argument as the Success: an object of parts, a tuple, a list', () => {
    const parts = { id: id('a'), n: count(1) }
    expect(collect(parts)).toBe(parts)
    const tuple = [id('a'), count(1)] as const
    expect(collect(tuple)).toBe(tuple)
    const list = [id('a'), id('b')]
    expect(collect(list)).toBe(list)
  })

  it('returns the first Failure among the parts, as the instance the part produced', () => {
    const first = new InvalidId('first')
    const second = new InvalidCount('second')
    expect(collect({ a: success(1), b: first, c: second })).toBe(first)
    expect(collect([success(1), second, first])).toBe(second)
    expect(collect([id('a'), id('BAD'), id('BAD')])).toBeInstanceOf(InvalidId)
  })

  it('passes a plain member through, falsy and nullish ones included', () => {
    const parts = { a: 0, b: '', c: null, d: undefined, e: false }
    expect(collect(parts)).toBe(parts)
    expect(isSuccess(collect([undefined, null, 0]))).toBe(true)
  })

  it('reads an empty object and an empty list as a Success', () => {
    expect(isSuccess(collect({}))).toBe(true)
    expect(isSuccess(collect([]))).toBe(true)
  })

  it('nests: a collect is a part of another', () => {
    const bad = collect({ inner: collect([id('a'), id('BAD')]) })
    expect(bad).toBeInstanceOf(InvalidId)
    const ok = collect({ inner: collect([id('a')]), n: 1 })
    expect(isSuccess(ok)).toBe(true)
  })

  it('a part that throws while collect reads it propagates', () => {
    // A getter runs inside `collect`'s own iteration, not while the
    // arguments are evaluated.
    const bug = new TypeError('bug')
    const parts = {
      first: id('a'),
      get second(): Result<string, InvalidId> {
        throw bug
      },
    }
    expect(thrownBy(() => collect(parts))).toBe(bug)
    const list = [
      id('a'),
      {
        get x(): never {
          throw bug
        },
      },
    ]
    // A list is read by index: a getter on a member is not read at all.
    expect(isSuccess(collect(list))).toBe(true)
    const holder: Result<string, InvalidId>[] = []
    Object.defineProperty(holder, '0', {
      get(): never {
        throw bug
      },
      enumerable: true,
    })
    expect(thrownBy(() => collect(holder))).toBe(bug)
    const bare = {
      get thrower(): unknown {
        throw 'not even an Error'
      },
    }
    expect(thrownBy(() => collect(bare))).toBe('not even an Error')
  })

  it('reads a frozen argument without changing it, and a later change to the argument shows through', () => {
    const frozen = Object.freeze({ id: id('a') })
    const out = collect(frozen)
    expect(out).toBe(frozen)
    expect(Object.isFrozen(out)).toBe(true)
    const live: { id: Result<string, InvalidId> } = { id: id('a') }
    const collected = collect(live)
    live.id = id('BAD')
    // The Success is the caller's own object, so it now holds a Failure.
    expect(isSuccess(collected)).toBe(true)
    expect(isFailure((collected as typeof live).id)).toBe(true)
  })

  it('reads all own string keys of an object passed through a narrower type, and a non-enumerable getter', () => {
    const wider = { id: id('a'), n: count(-1) }
    const view: { id: Result<string, InvalidId> } = wider
    const r = collect(view)
    expect(r).toBeInstanceOf(InvalidCount)
    const narrowest: { id: string } = { id: 'a', ...{ n: count(-1) } }
    expect(collect(narrowest)).toBeInstanceOf(InvalidCount)
    const hiddenGetter = { shown: id('a') }
    Object.defineProperty(hiddenGetter, 'hidden', {
      get: () => new InvalidId('from a getter'),
      enumerable: false,
    })
    expect(collect(hiddenGetter)).toBeInstanceOf(InvalidId)
  })

  it('does not read a hole in a list through the prototype', () => {
    const inherited = new InvalidId('inherited')
    // eslint-disable-next-line no-sparse-arrays -- the case under test: a hole
    const list = [success(1), , success(3)] as Result<number, InvalidId>[]
    ;(Array.prototype as unknown as Record<number, unknown>)[1] = inherited
    try {
      expect(collect(list)).toBe(list)
    } finally {
      delete (Array.prototype as unknown as Record<number, unknown>)[1]
    }
  })

  it('does not walk the prototype chain of an object of parts', () => {
    const prototype = new Proxy(
      {},
      {
        ownKeys(): never {
          throw new TypeError('walked')
        },
      },
    )
    const parts = Object.create(prototype) as { own: Result<string, InvalidId> }
    parts.own = id('a')
    expect(collect(parts)).toBe(parts)
  })

  describe('a getter part', () => {
    it('is run by collect as it reads, in key order, and not after the first Failure', () => {
      const bad = new InvalidId('bad')
      const reads: string[] = []
      const parts = {
        get first(): Result<string, InvalidId> {
          reads.push('first')
          return bad
        },
        get second(): Result<string, InvalidId> {
          reads.push('second')
          return id('a')
        },
      }
      expect(collect(parts)).toBe(bad)
      expect(reads).toEqual(['first'])
    })

    it('can read another part through this', () => {
      const parts = {
        a: 1,
        get b(): number {
          return this.a + 1
        },
      }
      expect(collect(parts, ({ b }) => b)).toBe(2)
    })

    it('runs again on each later read of the Success, which collect did not check', () => {
      let reads = 0
      const parts = {
        get x(): Result<string, InvalidId> {
          reads += 1
          return reads === 1 ? id('a') : new InvalidId('later')
        },
      }
      const collected = collect(parts)
      expect(collected).toBe(parts)
      expect(isFailure(parts.x)).toBe(true)
    })
  })

  it('reads an object by its own string keys, enumerable or not, and not inherited or symbol keys', () => {
    const bad = new InvalidId('bad')
    const symbol = Symbol('part')
    const withSymbol = { id: id('a'), [symbol]: bad }
    // @ts-expect-error - a symbol-keyed member is refused by the types; the check is the runtime's
    expect(isSuccess(collect(withSymbol))).toBe(true)
    const inherited = Object.create({ inherited: bad }) as {
      own: Result<string, InvalidId>
    }
    inherited.own = id('a')
    expect(isSuccess(collect(inherited))).toBe(true)
    const hidden = { shown: id('a') }
    Object.defineProperty(hidden, 'hidden', { value: bad, enumerable: false })
    expect(collect(hidden)).toBe(bad)
    const list = [id('a')]
    Object.assign(list, { extra: bad })
    expect(isSuccess(collect(list))).toBe(true)
  })

  it('reads an own __proto__ key that JSON.parse creates, and not the prototype a literal sets', () => {
    const bad = new InvalidId('bad')
    const parsed = JSON.parse('{"__proto__": 1, "n": 2}') as Record<
      string,
      unknown
    >
    expect(Object.hasOwn(parsed, '__proto__')).toBe(true)
    expect(isSuccess(collect(parsed))).toBe(true)
    Object.defineProperty(parsed, '__proto__', {
      value: bad,
      enumerable: true,
    })
    expect(collect(parsed)).toBe(bad)
    // A literal's `__proto__` sets the prototype, so it is not an own
    // member and is not read; the result is the literal itself, which is
    // now an Error through its prototype.
    const viaLiteral = { n: 1, __proto__: bad } as unknown as Record<
      string,
      Result<number, InvalidId>
    >
    expect(Object.hasOwn(viaLiteral, '__proto__')).toBe(false)
    expect(collect(viaLiteral)).toBe(viaLiteral)
  })

  describe('a part whose prototype chain cannot be read counts as not an Error', () => {
    const bug = new TypeError('bug from the trap')
    const unreadable = (): Result<string, InvalidId> =>
      new Proxy(
        {},
        {
          getPrototypeOf(): never {
            throw bug
          },
        },
      ) as unknown as Result<string, InvalidId>

    it('collect passes it through and drops what the trap threw', () => {
      const parts = { a: unreadable(), b: id('a') }
      expect(collect(parts)).toBe(parts)
    })

    it('a revoked Proxy passes through too', () => {
      const { proxy, revoke } = Proxy.revocable({}, {})
      revoke()
      const parts = [proxy as unknown as Result<string, InvalidId>]
      expect(collect(parts)).toBe(parts)
    })

    it('take returns it as the value', () => {
      const part = unreadable()
      expect(attempt<unknown, InvalidId>((take) => take(part))).toBe(part)
    })

    it('a leave from an enclosing attempt thrown by the trap is dropped', () => {
      const r = attempt<string, InvalidId>((outer) => {
        const trap = new Proxy(
          {},
          {
            getPrototypeOf(): never {
              outer(failure(new InvalidId('outer leave')))
              throw new Error('not reached')
            },
          },
        ) as unknown as Result<string, InvalidId>
        collect({ p: trap })
        return 'body completed'
      })
      expect(r).toBe('body completed')
    })
  })

  describe('the loops use the intrinsics captured when the module loaded, and no iterator', () => {
    it('Array.isArray replaced afterwards changes nothing', () => {
      const bad = new InvalidId('bad')
      const original = Array.isArray
      Array.isArray = (() => true) as unknown as typeof Array.isArray
      try {
        expect(collect({ a: bad })).toBe(bad)
        expect(collect([bad])).toBe(bad)
      } finally {
        Array.isArray = original
      }
    })

    it('Object.getOwnPropertyNames replaced afterwards changes nothing', () => {
      const bad = new InvalidId('bad')
      const original = Object.getOwnPropertyNames
      Object.getOwnPropertyNames = () => []
      try {
        expect(collect({ a: bad })).toBe(bad)
      } finally {
        Object.getOwnPropertyNames = original
      }
    })

    it('the array iterator replaced afterwards changes nothing', () => {
      const bad = new InvalidId('bad')
      const proto = Object.getPrototypeOf([][Symbol.iterator]()) as {
        next: () => unknown
      }
      const originalNext = proto.next
      const originalIterator = Array.prototype[Symbol.iterator]
      try {
        proto.next = () => ({ done: true, value: undefined })
        Array.prototype[Symbol.iterator] = function* () {
          // yields nothing
        } as (typeof Array.prototype)[typeof Symbol.iterator]
        expect(collect({ a: bad })).toBe(bad)
        expect(collect([bad])).toBe(bad)
      } finally {
        proto.next = originalNext
        Array.prototype[Symbol.iterator] = originalIterator
      }
    })

    it('Object.hasOwn replaced afterwards changes nothing', () => {
      const bad = new InvalidId('bad')
      const original = Object.hasOwn
      Object.hasOwn = () => false
      try {
        expect(collect([bad])).toBe(bad)
      } finally {
        Object.hasOwn = original
      }
    })
  })

  it('rows.map(collect) throws a TypeError, since map passes the index as build', () => {
    const rows = [{ a: 1 }, { a: 2 }]
    expect(() => rows.map(collect)).toThrow(TypeError)
    expect(rows.map((row) => collect(row))).toEqual(rows)
  })

  it('refuses an argument that is not an object', () => {
    for (const bad of [undefined, null, 1, 'a', true, Symbol('s')]) {
      // @ts-expect-error - the runtime check is the case under test
      expect(thrownBy(() => collect(bad))).toBeInstanceOf(TypeError)
    }
  })

  describe('with a build step', () => {
    it('builds from the collected parts on a Success', () => {
      const parts = { id: id('a'), n: count(2) }
      const built = collect(parts, ({ id, n }) => `${id}:${n}`)
      expect(built).toBe('a:2')
      expect(collect([id('a'), count(3)], ([a, n]) => ({ a, n }))).toEqual({
        a: 'a',
        n: 3,
      })
    })

    it('hands build the argument itself', () => {
      const parts = { id: id('a') }
      let seen: unknown
      collect(parts, (collected) => {
        seen = collected
        return 0
      })
      expect(seen).toBe(parts)
    })

    it('does not call build when a part failed, and returns that Failure', () => {
      let called = false
      const bad = new InvalidId('bad')
      const r = collect({ id: bad, n: count(1) }, () => {
        called = true
        return 0
      })
      expect(r).toBe(bad)
      expect(called).toBe(false)
    })

    it('returns the Failure build returns, and a Success of a plain value alike', () => {
      const own = new InvalidCount('own')
      const failed = collect({ n: count(1) }, () => failure(own))
      expect(failed).toBe(own)
      const mixed = collect({ n: count(1) }, ({ n }) =>
        n > 5 ? failure(own) : n,
      )
      expect(mixed).toBe(1)
    })

    it('calls build as a plain function, with no this', () => {
      let thisWasUndefined: boolean | undefined
      collect({ n: count(1) }, function (this: unknown) {
        thisWasUndefined = this === undefined
        return 0
      })
      expect(thisWasUndefined).toBe(true)
    })

    it('catches nothing: a throw from build propagates', () => {
      const bug = new TypeError('bug')
      expect(
        thrownBy(() =>
          collect({ n: count(1) }, () => {
            throw bug
          }),
        ),
      ).toBe(bug)
    })

    it('is decided by arity: an explicit undefined build is refused, before any part is read', () => {
      const parts = { id: new InvalidId('bad') }
      // @ts-expect-error - the runtime check is the case under test
      expect(thrownBy(() => collect(parts, undefined))).toBeInstanceOf(
        TypeError,
      )
      // @ts-expect-error - the runtime check is the case under test
      expect(thrownBy(() => collect(parts, 'not a function'))).toBeInstanceOf(
        TypeError,
      )
    })
  })
})

describe('attempt', () => {
  it('returns the body result when no take met a Failure', () => {
    expect(attempt((take) => take(id('a')) + take(id('b')))).toBe('ab')
    expect(attempt(() => 7)).toBe(7)
  })

  it('take returns the part itself: a nullish and an empty value included', () => {
    expect(attempt((take) => take(success(undefined)))).toBeUndefined()
    expect(attempt((take) => take(success(null)))).toBeNull()
    expect(attempt((take) => take(success(0)))).toBe(0)
  })

  it('leaves at the first Failure, with that instance, and runs nothing after it', () => {
    const bad = new InvalidId('bad')
    let reached = false
    const r = attempt((take) => {
      take(id('a'))
      take(failure(bad))
      reached = true
      return take(count(1))
    })
    expect(r).toBe(bad)
    expect(reached).toBe(false)
  })

  it('catches only its own leave: a bug propagates, an Error or not', () => {
    const bug = new TypeError('bug')
    expect(
      thrownBy(() =>
        attempt(() => {
          throw bug
        }),
      ),
    ).toBe(bug)
    expect(
      thrownBy(() =>
        attempt(() => {
          throw 'not even an Error'
        }),
      ),
    ).toBe('not even an Error')
  })

  it('a Failure the body returns is the result, not a leave', () => {
    const bad = new InvalidId('returned')
    expect(attempt(() => bad)).toBe(bad)
  })

  it('a nested take reaches its own attempt', () => {
    const r = attempt<string, InvalidId>((outer) => {
      const inner = attempt<number, InvalidId>((take) => take(id('BAD')).length)
      return `${outer(id('ok'))}:${inner instanceof InvalidId}`
    })
    expect(r).toBe('ok:true')
  })

  it('a take from an enclosing attempt that is still running leaves that one', () => {
    let reached = false
    const r = attempt<number, InvalidId>((outer) => {
      const inner = attempt<number, InvalidId>(() => {
        outer(id('BAD'))
        return 1
      })
      reached = true
      return inner === 1 ? 2 : 3
    })
    expect(r).toBeInstanceOf(InvalidId)
    expect(reached).toBe(false)
  })

  it('a take given a Failure after its own attempt has returned throws a token that is not an Error', () => {
    let kept: Take<InvalidId> | undefined
    attempt((take: Take<InvalidId>) => {
      kept = take
      return 0
    })
    const thrown = thrownBy(() => kept?.(id('BAD')))
    expect(thrown).toBeDefined()
    expect(thrown).not.toBeInstanceOf(Error)
    // The attempt that is running now does not take it for its own leave.
    const run = (): Result<number, InvalidId> =>
      attempt(() => {
        kept?.(id('BAD'))
        return 1
      })
    const reached = thrownBy(run)
    expect(reached).not.toBeInstanceOf(Error)
    expect((reached as { failure: unknown }).failure).toBeInstanceOf(InvalidId)
  })

  it('a take given a Success after its own attempt has returned returns the value', () => {
    let kept: Take<InvalidId> | undefined
    attempt((take: Take<InvalidId>) => {
      kept = take
      return 0
    })
    expect(kept?.(id('a'))).toBe('a')
  })

  it('an async body that takes a Failure rejects with a token that is not an Error', async () => {
    const body = async (take: Take<InvalidId>): Promise<string> =>
      take(id('BAD'))
    // @ts-expect-error - an async body is refused by the types; this is the runtime it would have
    const settled = attempt(body) as unknown as Promise<string>
    let thrown: unknown
    try {
      await settled
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeDefined()
    expect(thrown).not.toBeInstanceOf(Error)
  })

  it('take leaves from inside a list map callback and a Maybe map callback', () => {
    const list = attempt<string[], InvalidId>((take) =>
      ['a', 'BAD', 'c'].map((raw) => take(id(raw))),
    )
    expect(list).toBeInstanceOf(InvalidId)
    let reached = false
    const maybeLeave = attempt<string | undefined, InvalidId>((take) => {
      const value = mapMaybe((raw: string) => take(id(raw)), 'BAD')
      reached = true
      return value
    })
    expect(maybeLeave).toBeInstanceOf(InvalidId)
    expect(reached).toBe(false)
    const absent = attempt<string | undefined, InvalidId>((take) =>
      mapMaybe((raw: string) => take(id(raw)), undefined),
    )
    expect(absent).toBeUndefined()
  })

  it('a later take can depend on an earlier one', () => {
    const r = attempt<number, InvalidCount | InvalidId>((take) => {
      const raw = take(id('a'))
      return take(count(raw.length - 2))
    })
    expect(r).toBeInstanceOf(InvalidCount)
  })

  describe('the token', () => {
    it('a later take caught in a finally leaves the first Failure as the result', () => {
      const first = new InvalidId('first')
      const second = new InvalidId('second')
      const r = attempt<number, InvalidId>((take) => {
        try {
          take(failure(first))
          return 1
        } finally {
          try {
            take(failure(second))
          } catch {
            // swallowed: the first leave is still propagating
          }
        }
      })
      expect(r).toBe(first)
    })

    it('a take whose throw goes uncaught in a finally replaces the first leave', () => {
      const first = new InvalidId('first')
      const second = new InvalidId('second')
      const r = attempt<number, InvalidId>((take) => {
        try {
          take(failure(first))
          return 1
        } finally {
          take(failure(second))
        }
      })
      expect(r).toBe(second)
    })

    it('a bug thrown from a finally replaces the leave', () => {
      const bug = new TypeError('bug')
      expect(
        thrownBy(() =>
          attempt<number, InvalidId>((take) => {
            try {
              take(failure(new InvalidId('first')))
              return 1
            } finally {
              // eslint-disable-next-line no-unsafe-finally -- the case under test
              throw bug
            }
          }),
        ),
      ).toBe(bug)
    })

    it('a body that catches the token cannot change its Failure', () => {
      const real = new InvalidId('real')
      const r = attempt<number, InvalidId>((take) => {
        try {
          take(failure(real))
        } catch (token) {
          try {
            ;(token as { failure: unknown }).failure = 'forged'
          } catch {
            // frozen: the write throws in strict mode
          }
          throw token
        }
        return 1
      })
      expect(r).toBe(real)
    })

    it('a token another attempt threw is not recognised: it propagates', () => {
      let foreign: unknown
      attempt<number, InvalidId>((take) => {
        try {
          take(failure(new InvalidId('inner')))
        } catch (token) {
          foreign = token
        }
        return 0
      })
      const thrown = thrownBy(() =>
        attempt<number, InvalidId>(() => {
          throw foreign
        }),
      )
      expect(thrown).toBe(foreign)
    })

    /* A body that has caught a token holds the `Leave` class through it. */
    function caughtToken(): { constructor: Record<string, unknown> } {
      let token: unknown
      attempt<number, InvalidId>((take) => {
        try {
          take(failure(new InvalidId('x')))
        } catch (caught) {
          token = caught
        }
        return 0
      })
      return token as { constructor: Record<string, unknown> }
    }
    const laterAttemptsStillSeeOnlyTheirOwn = (): void => {
      const bug = new TypeError('bug')
      expect(
        thrownBy(() =>
          attempt(() => {
            throw bug
          }),
        ),
      ).toBe(bug)
      const lookalike = { failure: 42 }
      expect(
        thrownBy(() =>
          attempt(() => {
            throw lookalike
          }),
        ),
      ).toBe(lookalike)
    }

    it('replacing the brand check on the caught token constructor changes nothing for later attempts', () => {
      const token = caughtToken()
      const original = token.constructor.ownedBy
      try {
        try {
          token.constructor.ownedBy = () => true
        } catch {
          // frozen: the write throws in strict mode
        }
        laterAttemptsStillSeeOnlyTheirOwn()
      } finally {
        try {
          token.constructor.ownedBy = original
        } catch {
          // frozen: nothing was changed
        }
      }
      expect(Object.isFrozen(token.constructor)).toBe(true)
    })

    it('changing the prototype of a caught token changes nothing for later attempts', () => {
      const token = caughtToken()
      const prototype = Object.getPrototypeOf(token) as Record<string, unknown>
      const parent = Object.getPrototypeOf(prototype) as object | null
      try {
        expect(Object.isFrozen(prototype)).toBe(true)
        expect(() => {
          Object.setPrototypeOf(prototype, Error.prototype)
        }).toThrow(TypeError)
        expect(() =>
          Object.defineProperty(prototype, 'then', {
            value: 1,
            configurable: true,
          }),
        ).toThrow(TypeError)
        laterAttemptsStillSeeOnlyTheirOwn()
      } finally {
        try {
          Object.setPrototypeOf(prototype, parent)
          delete prototype['then']
        } catch {
          // frozen: nothing was changed
        }
      }
    })

    it('a token is frozen even when Object.freeze was replaced after the module loaded', () => {
      const { freeze } = Object
      Object.freeze = ((value: unknown) => value) as typeof Object.freeze
      let token: unknown
      try {
        attempt<number, InvalidId>((take) => {
          try {
            take(failure(new InvalidId('x')))
          } catch (caught) {
            token = caught
          }
          return 0
        })
      } finally {
        Object.freeze = freeze
      }
      expect(Object.isFrozen(token)).toBe(true)
    })

    it('a token is frozen and is not an Error', () => {
      let token: unknown
      attempt<number, InvalidId>((take) => {
        try {
          take(failure(new InvalidId('x')))
        } catch (caught) {
          token = caught
        }
        return 0
      })
      expect(Object.isFrozen(token)).toBe(true)
      expect(token).not.toBeInstanceOf(Error)
    })
  })

  describe('a callback whose caller catches throws swallows the leave', () => {
    it('a Promise executor: the attempt returns the body value and the promise rejects with the token', async () => {
      let pending: Promise<unknown> | undefined
      const r = attempt<string, InvalidId>((take) => {
        pending = new Promise(() => {
          take(failure(new InvalidId('inside the executor')))
        })
        return 'body completed'
      })
      expect(r).toBe('body completed')
      let rejection: unknown
      try {
        await pending
      } catch (error) {
        rejection = error
      }
      expect(rejection).toBeDefined()
      expect(rejection).not.toBeInstanceOf(Error)
    })
  })

  describe('what in the body swallows or rewrites the leave', () => {
    it('a try/catch swallows it', () => {
      const r = attempt<number, InvalidId>((take) => {
        try {
          take(id('BAD'))
          return 1
        } catch {
          return 2
        }
      })
      expect(r).toBe(2)
    })

    it('a finally that returns swallows it', () => {
      let reached = false
      const r = attempt<number, InvalidId>((take) => {
        try {
          take(id('BAD'))
          reached = true
          return 1
        } finally {
          // eslint-disable-next-line no-unsafe-finally -- the case under test
          return 3
        }
      })
      expect(r).toBe(3)
      expect(reached).toBe(false)
    })

    it('a tryCatch with the default handler turns it into a ThrownError holding the token', () => {
      const r = attempt<Result<number, Error>, InvalidId>((take) =>
        tryCatch(() => take(id('BAD')).length)(),
      )
      expect(r).toBeInstanceOf(ThrownError)
      expect(isFailure(r)).toBe(true)
      expect((r as unknown as ThrownError).thrown).not.toBeInstanceOf(Error)
    })

    it('a tryCatch with a function handler returns whatever the handler builds', () => {
      const seven = attempt<Result<number, Error>, InvalidId>((take) =>
        tryCatch(
          () => take(id('BAD')).length,
          () => 7,
        )(),
      )
      expect(seven).toBe(7)
      let received: unknown
      const own = attempt<Result<number, InvalidId>, InvalidId>((take) =>
        tryCatch(
          () => take(id('BAD')).length,
          (thrown) => {
            received = thrown
            return failure(new InvalidId(typeof thrown))
          },
        )(),
      )
      expect(own).toBeInstanceOf(InvalidId)
      expect((own as InvalidId).message).toBe('object')
      expect(received).not.toBeInstanceOf(Error)
      expect((received as { failure: unknown }).failure).toBeInstanceOf(
        InvalidId,
      )
    })

    it('a tryCatch with catchOnly or a class list lets it through', () => {
      const bad = new InvalidId('bad')
      const through = attempt<Result<number, InvalidId>, InvalidId>((take) =>
        tryCatch(() => take(failure(bad)), catchOnly(InvalidId))(),
      )
      expect(through).toBe(bad)
      const listed = attempt<Result<number, InvalidId>, InvalidId>((take) =>
        tryCatch(() => take(failure(bad)), [InvalidId])(),
      )
      expect(listed).toBe(bad)
    })
  })
})
