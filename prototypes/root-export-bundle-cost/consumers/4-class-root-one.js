// One Box class off the root, two of its members called.
import { Maybe } from '@lhellemons/ground-types'
export const out = Maybe.from(1)
  .map((n) => n + 1)
  .unbox()
