/**
 * PROTOTYPE — throwaway. Entering variant B from `result/box`. Expected to
 * WORK: `maybe/box` gets to finish evaluating before the static initialiser
 * that reads it runs. Same code, opposite outcome, decided by the consumer.
 */
import { Result } from './result-box.js'

console.log('  reached the body:', Result.from<number>(1).result)
console.log('  the eager static:', Result.EMPTY.value)
