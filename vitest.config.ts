import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /* Inferred types are part of this library's public interface, so type
       assertions run as real tests (`*.test-d.ts`) rather than as bare tsc
       errors — a broken inference surfaces as a failing test, not as a
       compiler error buried in unrelated output. */
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
