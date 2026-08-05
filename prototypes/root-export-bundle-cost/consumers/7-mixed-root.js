// Namespace and class side by side off the root — the ergonomic pitch of
// charting decision 4.
import { maybe, Maybe } from '@lhellemons/ground-types'
export const out = [maybe.maybe(1), Maybe.from(1).unbox()]
