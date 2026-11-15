import { InternRegistry } from './index.js'

// Instances are held weakly, and only objects can be weak referents, so a
// primitive value type must be rejected.
// @ts-expect-error — V must extend object
void new InternRegistry<string, number>()
