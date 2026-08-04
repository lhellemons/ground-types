// @ts-check
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores(['dist', 'coverage']),
  js.configs.recommended,

  /* The build/dev scripts are Node ESM, not browser or library code. Without
     this they trip `no-undef` on `console`, `process` and `URL`. */
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  /* Type-aware linting for the library source. `projectService` resolves
     each file's tsconfig automatically instead of naming one statically, so
     both tsconfig.json (src) and tsconfig.build.json stay in sync with what
     ESLint type-checks against. */
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Headline rules for this audit (see gh issue #12), restated as
      // explicit errors so a future preset change can't silently demote
      // them. Most of these already ship as errors in recommendedTypeChecked
      // — no-unnecessary-condition is the one genuine addition, since it
      // only lives in the stricter, not-enabled-here strict-type-checked
      // config.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      // `_`-prefixed params are a deliberate "intentionally unused" marker
      // (e.g. a callback whose shape is fixed by the combinator it's passed
      // to), not dead code.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },

  /* Tests keep every type-aware rule above except the three that a test
     suite for *this* library structurally cannot satisfy. `/promise`,
     `/call` and `/result` exist to normalise an arbitrary thrown or
     rejected value into a `Failure` carrying an `Error` (`RejectionError`,
     `ThrownError`); rejecting or throwing a bare string is the input under
     test, not a mistake, so `prefer-promise-reject-errors` and
     `only-throw-error` would fire on the assertions that matter most.
     `require-await` fires on `async () => value`, the shortest way to spell
     a promise-returning stub. Relaxed here rather than at ~30 call sites. */
  {
    files: ['src/**/*.test.ts', 'src/**/*.test-d.ts'],
    rules: {
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },

  /* Root-level config files sit outside src/'s tsconfig, so they get plain
     (non-type-aware) linting rather than being folded into a project just
     to satisfy ESLint. */
  {
    files: ['*.config.{js,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
