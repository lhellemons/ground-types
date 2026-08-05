// The Call Box alone: its two members reach `call/abortable`, which reaches
// the whole AbortablePromise.
import { Call } from '@lhellemons/ground-types/call/box'
export const out = Call.from((n) => n).invoke(1)
