/**
 * PROTOTYPE — throwaway. Isolated because the clash is a *declaration* error,
 * which would poison the rest of a file.
 */
// @ts-expect-error — Duplicate identifier 'Maybe' (reported on both halves).
import { Maybe } from './maybe-box.js'
// @ts-expect-error — Duplicate identifier 'Maybe'.
import type { Maybe } from '../../src/maybe/index.js'

void Maybe.from(3)
