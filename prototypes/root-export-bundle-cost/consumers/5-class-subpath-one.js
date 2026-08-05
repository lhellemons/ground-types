// The same Box class off its own subpath — isolates the root's contribution.
import { Maybe } from '@lhellemons/ground-types/maybe/box'
export const out = Maybe.from(1)
  .map((n) => n + 1)
  .unbox()
