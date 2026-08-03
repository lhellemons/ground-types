import { expectTypeOf } from 'vitest'
import type { Branded } from './index.js'

type UserId = Branded<string, 'UserId'>

// The brand key is module-private — a hand-rolled string-keyed cast cannot
// produce a value with the real (symbol-keyed) brand, so it must not be
// assignable to a Branded type.
const forged = 'abc' as string & { __brand: 'UserId' }
// @ts-expect-error — forged lacks the module-private brand symbol
const _forgedAsUserId: UserId = forged
void _forgedAsUserId

// The brand key must not leak into keyof — no plain string key named
// '__brand' (or otherwise) should appear on a Branded type.
expectTypeOf<Extract<keyof UserId, '__brand'>>().toEqualTypeOf<never>()
