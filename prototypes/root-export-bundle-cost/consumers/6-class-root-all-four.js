// All four Box classes off the root.
import { Call, Fn, Maybe, Result } from '@lhellemons/ground-types'
export const out = [
  Maybe.from(1).unbox(),
  Result.success(1).unbox(),
  Fn.from((n) => n).apply(1),
  Call.from((n) => n).invoke(1),
]
