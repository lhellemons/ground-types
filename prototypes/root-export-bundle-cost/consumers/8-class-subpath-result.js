// One method on the Result Box: measures what a class's prototype drags in
// that the equivalent named import would not.
import { Result } from '@lhellemons/ground-types/result/box'
export const out = Result.success(1).unbox()
