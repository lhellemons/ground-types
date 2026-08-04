/**
 * PROTOTYPE — throwaway. Entering variant B from `maybe/box`. Expected to
 * CRASH: `maybe/box` evaluates `result/box` first, whose static initialiser
 * reaches for `Maybe` while `maybe/box` is still mid-evaluation.
 */
import { Maybe } from './maybe-box.js'

console.log('  reached the body:', Maybe.from(1).value)
