// Arm 6's functional twin: the same four modules, reached as namespaces off
// the root, doing the same four operations.
import { call, fn, maybe, result } from '@lhellemons/ground-types'
export const out = [
  maybe.maybe(1),
  result.success(1),
  fn.identity(1),
  call.abortable((n) => n),
]
