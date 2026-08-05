// One namespace off the namespace-only root — the "what a consumer pays
// today" arm.
import { maybe } from '../roots/namespace-only.js'
export const out = maybe.map((n) => n + 1, maybe.maybe(1))
