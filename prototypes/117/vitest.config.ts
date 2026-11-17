import { defineConfig } from 'vitest/config'

/* PROTOTYPE #117 — runs the probes in this directory only. */
export default defineConfig({
  test: {
    include: ['prototypes/117/probe.runtime.ts'],
    typecheck: {
      enabled: true,
      include: ['prototypes/117/**/*.test-d.ts'],
      tsconfig: './prototypes/117/tsconfig.json',
    },
  },
})
