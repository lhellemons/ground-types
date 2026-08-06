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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test-d.ts',
        // `export type`-only modules erase to an empty JS file and are
        // never loaded at runtime, so v8 reports them as 0% covered
        // rather than vacuously 100% — excluded rather than chased. This
        // list is by hand because "erases to nothing" is not something a
        // glob can see; a new type-only module has to be added here.
        'src/brand/index.ts',
        'src/call/types.ts',
        'src/domain/index.ts',
        'src/result/internal.ts',
        // The Box surface is pinned but unimplemented — every member
        // throws (see docs/adr/0005-box-classes.md). The implementation
        // effort removes these lines along with the stubs.
        'src/call/box.ts',
        'src/fn/box.ts',
        'src/maybe/box.ts',
        'src/result/box.ts',
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 90,
        functions: 90,
      },
    },
  },
})
