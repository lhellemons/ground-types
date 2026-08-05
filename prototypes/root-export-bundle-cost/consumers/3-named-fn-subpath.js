// The recommended style: two named functions off a subpath. The floor.
import { map, maybe } from '@lhellemons/ground-types/maybe'
export const out = map((n) => n + 1, maybe(1))
