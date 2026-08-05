// The identical import, off the class-bearing root. Any difference against
// arm 1 is what the four class bindings cost a consumer who never names one.
import { maybe } from '@lhellemons/ground-types'
export const out = maybe.map((n) => n + 1, maybe.maybe(1))
