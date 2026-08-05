// Arm 10's functional twin: is AbortablePromise the Box's cost, or the
// module's? `abortable` is what the Call Box's method delegates to.
import { abortable } from '@lhellemons/ground-types/call'
export const out = abortable((n) => n)(1)
