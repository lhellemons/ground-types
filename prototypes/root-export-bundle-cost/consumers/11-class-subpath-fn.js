// The Fn Box alone — the smallest of the four.
import { Fn } from '@lhellemons/ground-types/fn/box'
export const out = Fn.from((n) => n).apply(1)
