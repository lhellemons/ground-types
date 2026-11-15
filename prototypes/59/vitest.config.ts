import { defineConfig } from 'vitest/config'

/* PROTOTYPE #59 — runs the probes in this directory only. */
export default defineConfig({
  test: {
    include: ['prototypes/59/probe.runtime.ts'],
    typecheck: {
      enabled: true,
      include: ['prototypes/59/**/*.test-d.ts'],
      tsconfig: './prototypes/59/tsconfig.json',
    },
  },
})
